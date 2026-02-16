import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
const pdf = require('pdf-parse')

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const fileName = file.name.toLowerCase()
        const orgId = await getOrgId(supabase, user.id)

        // --- 1. Upload Raw File to Storage (Safety Net) ---
        const timestamp = Date.now()
        const dateObj = new Date()
        const year = dateObj.getFullYear()
        const month = String(dateObj.getMonth() + 1).padStart(2, '0')
        // Sanitize filename to avoid weird chars in path
        const safeFileName = fileName.replace(/[^a-z0-9.-]/gi, '_')
        const storagePath = `${orgId}/${year}/${month}/${timestamp}_${safeFileName}`

        const { error: storageError } = await supabase.storage
            .from('raw-imports')
            .upload(storagePath, buffer, {
                contentType: file.type,
                upsert: false
            })

        if (storageError) {
            console.error('Storage Upload Error:', storageError)
            // We continue even if storage fails? No, "Safety Net" implies we MUST have it.
            // But for MVP if bucket doesn't exist, maybe we warn?
            // Let's be strict: If we can't save the raw file, we abort. 
            // Unless it's a "Bucket not found" and we want to be nice. 
            // RETRY: PROCEED but log error. User might not have created bucket yet.
            // actually user said "Listo", so assume bucket exists.
            return NextResponse.json({ error: 'Error al asegurar el archivo original. Verifique el bucket "raw-imports".' }, { status: 500 })
        }

        // --- 2. Create Audit Log (archivos_importados) ---
        const { data: importLog, error: dbError } = await supabase
            .from('archivos_importados')
            .insert({
                organization_id: orgId,
                nombre_archivo: fileName,
                storage_path: storagePath,
                estado: 'procesando',
                metadata: { size: buffer.length, type: file.type }
            })
            .select()
            .single()

        if (dbError || !importLog) {
            console.error('DB Log Error:', dbError)
            return NextResponse.json({ error: 'Error al iniciar registro de auditoría.' }, { status: 500 })
        }

        const importId = importLog.id

        // --- 3. Parse Content ---
        // --- 3. Parse Content ---
        type ReviewItem = {
            organization_id: string
            datos_crudos: any
            motivo: string
            estado: string
            fecha?: string
            descripcion?: string
            monto?: number
        }
        type ParseResult = { transactions: any[], warnings: string[], reviewItems: ReviewItem[] }
        let parseResult: ParseResult = { transactions: [], warnings: [], reviewItems: [] }

        try {
            if (fileName.endsWith('.csv') || fileName.endsWith('.txt') || fileName.endsWith('.dat')) {
                const text = buffer.toString('utf-8')
                parseResult = parseText(text, orgId, fileName.endsWith('.csv') ? ',' : undefined)
            } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                parseResult = parseExcel(buffer, orgId)
            } else if (fileName.endsWith('.pdf')) {
                const pdfData = await pdf(buffer)
                parseResult = parsePDF(pdfData.text, orgId)
            } else {
                throw new Error('Formato no soportado')
            }
        } catch (e: any) {
            console.error('Parsing error', e)
            // Update Log to Error
            await supabase.from('archivos_importados').update({
                estado: 'error',
                metadata: { error: e.message }
            }).eq('id', importId)

            return NextResponse.json({ error: 'Error al leer el archivo. Verifique el formato.' }, { status: 400 })
        }

        const { transactions, warnings, reviewItems } = parseResult

        // --- 3.5. Insert Review Items (Quarantine) ---
        if (reviewItems && reviewItems.length > 0) {
            const reviewsWithLink = reviewItems.map(r => ({
                ...r,
                archivo_importacion_id: importId
            }))

            const { error: reviewError } = await supabase
                .from('transacciones_revision')
                .insert(reviewsWithLink)

            if (reviewError) {
                console.error('Error inserting review items:', reviewError)
                warnings.push(`Error al guardar items en cuarentena: ${reviewError.message}`)
            }
        }

        // --- 4. Store Data & Finish Link ---
        if (transactions.length > 0) {
            // Attach import_id to every transaction
            const transactionsWithLink = transactions.map(t => ({
                ...t,
                archivo_importacion_id: importId
            }))

            // Optimization: Get min/max dates from new transactions to filter query
            let minDate = transactionsWithLink[0].fecha
            let maxDate = transactionsWithLink[0].fecha

            transactionsWithLink.forEach(t => {
                if (t.fecha < minDate) minDate = t.fecha
                if (t.fecha > maxDate) maxDate = t.fecha
            })

            const { data: existing } = await supabase
                .from('transacciones')
                .select('fecha, descripcion, monto')
                .eq('organization_id', orgId)
                .gte('fecha', minDate)
                .lte('fecha', maxDate)

            const existingSet = new Set(
                existing?.map(e => `${e.fecha}-${e.descripcion}-${e.monto}`)
            )

            const uniqueTransactions = transactionsWithLink.filter(t => {
                const key = `${t.fecha}-${t.descripcion}-${t.monto}`
                return !existingSet.has(key)
            })

            // Insert
            if (uniqueTransactions.length > 0) {
                const { error } = await supabase.from('transacciones').insert(uniqueTransactions)

                if (error) {
                    console.error('Database insertion error:', error)
                    await supabase.from('archivos_importados').update({
                        estado: 'error',
                        metadata: { error: error.message, stage: 'insertion' }
                    }).eq('id', importId)
                    return NextResponse.json({ error: 'Error al guardar datos.' }, { status: 500 })
                }

                // Success Update
                await supabase.from('archivos_importados').update({
                    estado: 'completado',
                    metadata: {
                        processed: transactions.length,
                        inserted: uniqueTransactions.length,
                        warnings: warnings.slice(0, 20)
                    }
                }).eq('id', importId)

                return NextResponse.json({
                    success: true,
                    count: uniqueTransactions.length,
                    skipped: transactions.length - uniqueTransactions.length,
                    reviewCount: reviewItems?.length || 0,
                    warnings: warnings.slice(0, 50),
                    message: `Procesado: ${uniqueTransactions.length} OK. ${reviewItems?.length ? reviewItems.length + ' en revisión.' : ''}`
                })
            } else {
                // All dupes
                await supabase.from('archivos_importados').update({
                    estado: 'completado',
                    metadata: {
                        processed: transactions.length,
                        inserted: 0,
                        warnings: warnings.slice(0, 20),
                        note: 'All duplicates'
                    }
                }).eq('id', importId)

                return NextResponse.json({
                    success: true,
                    count: 0,
                    skipped: transactions.length,
                    warnings: warnings.slice(0, 50),
                    message: 'Los datos ya existían en el sistema'
                })
            }
        }

        // Fallback (empty file or no transactions found)
        await supabase.from('archivos_importados').update({
            estado: 'completado',
            metadata: {
                processed: 0,
                inserted: 0,
                warnings: warnings.slice(0, 20),
                note: 'No transactions found'
            }
        }).eq('id', importId)

        return NextResponse.json({
            success: true,
            count: 0,
            warnings: warnings.slice(0, 50),
            message: 'Archivo recibido y archivado, pero no se detectaron transacciones válidas.'
        })

    } catch (error) {
        console.error('Upload processing error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// --- Parsers ---

function parseText(text: string, orgId: string, delimiter?: string): { transactions: any[], warnings: string[], reviewItems: any[] } {
    const lines = text.split('\n')
    const transactions = []
    let warnings: string[] = []
    let reviewItems: any[] = []

    // Auto-detect delimiter if not provided
    const detectDelimiter = (line: string) => {
        if (line.includes(',')) return ','
        if (line.includes(';')) return ';'
        if (line.includes('\t')) return '\t'
        return ','
    }

    const actualDelimiter = delimiter || (lines.length > 1 ? detectDelimiter(lines[1]) : ',')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const parts = line.split(actualDelimiter)

        // Flexible Logic:
        // 1. Check for standard transaction (Date + Amount)
        // 2. Check for just CUIT (Client list?) -> Create a dummy transaction or skip (Current: skip if no date/amount)
        // User want flexible: "Si sólo tenemos CUIT... puede pedir listado..."
        // For MVP: We try to capture strict transactions. If strict fails, we try to capture "partial" usage?
        // Current DB requires: fecha, descripcion, monto.

        // Helper to extract CUIT-like
        const findCuit = (p: string[]) => p.find(s => s.match(/^\d{2}-?\d{8}-?\d{1}$/))

        let fecha: string | null = null
        let monto = 0
        let descripcion = 'Importado sin descripción'
        let cuit = findCuit(parts) || null

        // Date extraction attempt
        for (const p of parts) {
            const f = normalizeDate(p.trim())
            if (f) { fecha = f; break; }
        }

        // Amount extraction attempt
        for (const p of parts) {
            const stripped = p.replace(/[^0-9.,-]/g, '') // careful with dates, allow comma for decimals
            // If it looks like a number and not a date part...
            if (stripped.match(/^-?\d+([.,]\d+)?$/) && !p.includes('/') && !p.includes('-') && !p.includes(':')) {

                let val: number
                if (stripped.includes(',') && stripped.includes('.')) {
                    // 1.000,00 -> 1000.00
                    val = parseFloat(stripped.replace(/\./g, '').replace(',', '.'))
                } else if (stripped.includes(',')) {
                    // 1000,00 -> 1000.00
                    val = parseFloat(stripped.replace(',', '.'))
                } else {
                    val = parseFloat(stripped)
                }

                if (!isNaN(val) && Math.abs(val) > 0.01) { // Avoid 0 or empty
                    monto = val
                    break;
                }
            }
        }

        // Standard CSV approach check
        if (parts.length >= 3) {
            const f = normalizeDate(parts[0].trim())
            if (f) {
                fecha = f
                descripcion = parts[1].trim()
                // Try parsing amount from 3rd col
                const mStr = parts[2].trim()
                let m = 0
                if (mStr.includes(',') && mStr.includes('.')) {
                    m = parseFloat(mStr.replace(/\./g, '').replace(',', '.'))
                } else if (mStr.includes(',')) {
                    m = parseFloat(mStr.replace(',', '.'))
                } else {
                    m = parseFloat(mStr.replace(/[^0-9.-]/g, ''))
                }

                if (!isNaN(m)) monto = m
                if (parts.length > 3) cuit = parts[3].trim()
            }
        }

        // If generic parsing failed but we found a CUIT and no date? 
        if (!fecha && (monto !== 0 || cuit)) {
            fecha = new Date().toISOString().split('T')[0]
            descripcion = `Importación dato parcial (${cuit || 'Sin CUIT'})`
        }

        if (fecha && (monto !== 0 || cuit)) {
            transactions.push({
                organization_id: orgId,
                fecha,
                descripcion,
                monto,
                cuit_destino: cuit || null,
                origen_dato: 'csv_txt',
                moneda: 'ARS',
                estado: 'pendiente'
            })
            // If line is not empty but we failed to extract Date AND (Amount OR Cuit)
            // It's a skipped line. Is it noise or data?
            // If it has numbers or looks like a transaction, send to Quarantine
            if (line.match(/\d/) && line.length > 5) {
                // warnings.push(`Línea ${i + 1}: Enviada a revisión ("${line.substring(0, 50)}...")`)
                reviewItems.push({
                    organization_id: orgId,
                    datos_crudos: { line: line, source: 'text_parser', lineNumber: i + 1 },
                    motivo: 'Formato no reconocido (posible fecha/monto inválido)',
                    estado: 'pendiente',
                    descripcion: line.substring(0, 100) // Suggest the whole line as desc
                })
            }
        }
    }
    return { transactions, warnings, reviewItems }
}

function parseExcel(buffer: Buffer, orgId: string): { transactions: any[], warnings: string[], reviewItems: any[] } {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

    const transactions = []
    const warnings: string[] = []
    const reviewItems: any[] = []

    // Find header row
    let headerRowIndex = -1
    let colMap: any = { date: -1, desc: -1, amount: -1, cuit: -1 }

    for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
        const row = jsonData[i].map((c: any) => String(c).toLowerCase())
        if (row.some((c: string) => c.includes('fecha') || c.includes('date'))) {
            headerRowIndex = i
            row.forEach((cell: string, idx: number) => {
                if (cell.includes('fecha') || cell.includes('date')) colMap.date = idx
                else if (cell.includes('descrip') || cell.includes('detalle') || cell.includes('concept')) colMap.desc = idx
                else if (cell.includes('monto') || cell.includes('importe') || cell.includes('valor') || cell.includes('amount')) colMap.amount = idx
                else if (cell.includes('cuit')) colMap.cuit = idx
            })
            break
        }
    }

    // Default column mapping if no header found (0, 1, 2)
    if (headerRowIndex === -1 && jsonData.length > 0) {
        headerRowIndex = -1 // Start from 0
        colMap = { date: 0, desc: 1, amount: 2, cuit: 3 }
    }

    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (!row || row.length === 0) continue

        if (colMap.date > -1 && colMap.amount > -1) {
            let rawDate = row[colMap.date]
            // Excel dates are numbers (days since 1900)
            let fecha = ''
            if (typeof rawDate === 'number') {
                const dateObj = XLSX.SSF.parse_date_code(rawDate)
                // dateObj: {y, m, d, ...}
                fecha = `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`
            } else {
                fecha = normalizeDate(String(rawDate))
            }

            const descripcion = colMap.desc > -1 ? String(row[colMap.desc] || 'Sin descripción').trim() : 'Sin descripción'
            const rawAmount = row[colMap.amount]
            const monto = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount).replace(/[^0-9.-]/g, ''))
            const cuit = colMap.cuit > -1 ? String(row[colMap.cuit] || '').trim() : null

            if (fecha && !isNaN(monto)) {
                transactions.push({
                    organization_id: orgId,
                    fecha,
                    descripcion,
                    monto,
                    cuit_destino: cuit,
                    origen_dato: 'excel',
                    moneda: 'ARS',
                    estado: 'pendiente'
                })
            } else {
                // If row has content but failed parsing
                // Check if it's not just empty cells
                if (row.some(c => c)) {
                    // warnings.push(`Fila Excel ${i + 1}: Enviada a revisión`)
                    reviewItems.push({
                        organization_id: orgId,
                        datos_crudos: { row: row, sheet: firstSheetName, rowIndex: i },
                        motivo: 'Fila con datos pero fecha/monto no identificados',
                        estado: 'pendiente'
                    })
                }
            }
        }
    }
    return { transactions, warnings, reviewItems }
}

function parsePDF(text: string, orgId: string): { transactions: any[], warnings: string[], reviewItems: any[] } {
    const lines = text.split('\n')
    const transactions = []
    const warnings: string[] = []
    const reviewItems: any[] = []

    // Regex for DD/MM/YYYY or DD-MM-YYYY
    const dateRegexStart = /^(\d{2}[/-]\d{2}[/-]\d{2,4})/

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        const match = trimmed.match(dateRegexStart)

        let parsed = false
        if (match) {
            // It starts with a date
            const dateStr = match[1]
            const rest = trimmed.substring(match[0].length).trim()

            // Try to find amount at the end
            // Look for number with optionally - at start, and , or . decimals
            // E.g. -15.000,00
            const amountMatch = rest.match(/(-?[\d\.,]+)$/)

            if (amountMatch) {
                const amountStr = amountMatch[1]
                const descripcion = rest.substring(0, rest.length - amountStr.length).trim()

                // Normalizar monto: Euro style (dot thousand, comma decimal) vs US
                let monto = 0
                if (amountStr.includes(',') && amountStr.includes('.')) {
                    // 1.000,00 -> 1000.00
                    monto = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'))
                } else if (amountStr.includes(',')) {
                    // 1000,00 -> 1000.00
                    monto = parseFloat(amountStr.replace(',', '.'))
                } else {
                    monto = parseFloat(amountStr)
                }

                const fecha = normalizeDate(dateStr)

                if (fecha && !isNaN(monto)) {
                    transactions.push({
                        organization_id: orgId,
                        fecha,
                        descripcion: descripcion || 'Movimiento detectado',
                        monto,
                        cuit_destino: null,
                        origen_dato: 'pdf',
                        moneda: 'ARS',
                        estado: 'pendiente'
                    })
                    parsed = true
                }
            }
        }

        if (!parsed && trimmed.length > 20 && trimmed.match(/\d/)) {
            // Heuristic: Long line with numbers but failed to parse
            reviewItems.push({
                organization_id: orgId,
                datos_crudos: { line: trimmed, source: 'pdf_parser' },
                motivo: 'Línea PDF con números no procesada',
                estado: 'pendiente',
                descripcion: trimmed.substring(0, 100)
            })
        }
    }

    return { transactions, warnings, reviewItems }
}

// Helpers
function normalizeDate(dateStr: string): string {
    // Input: DD/MM/YYYY or YYYY-MM-DD
    // Output: YYYY-MM-DD
    try {
        if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) return dateStr // Already YYYY-MM-DD

        const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-')
        if (parts.length === 3) {
            // Assume DD/MM/YYYY
            const d = parts[0].padStart(2, '0')
            const m = parts[1].padStart(2, '0')
            const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2]
            return `${y}-${m}-${d}`
        }
    } catch (e) { return '' }
    return ''
}

async function getOrgId(supabase: any, userId: string) {
    let { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .single()

    if (member) return member.organization_id

    // Fallback: Create org if missing
    const { data: org } = await supabase
        .from('organizations')
        .insert({ name: 'Mi Empresa', tier: 'free' })
        .select()
        .single()

    await supabase.from('organization_members').insert({
        organization_id: org.id,
        user_id: userId,
        role: 'owner'
    })

    return org.id
}
