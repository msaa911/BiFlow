import { createClient } from '@/lib/supabase/server'
// Rebuild force - timestamp 1548
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const pdf = require('pdf-parse')
    let fileName = 'unknown_file'
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
        fileName = file.name.toLowerCase()
        const orgId = await getOrgId(supabase, user.id)

        // --- 1. Upload Raw File to Storage (Safety Net) ---
        const timestamp = Date.now()
        const dateObj = new Date()
        const year = dateObj.getFullYear()
        const month = String(dateObj.getMonth() + 1).padStart(2, '0')
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
            await logError(supabase, 'Storage Upload', storageError.message, fileName)
            return NextResponse.json({ error: 'Error al asegurar el archivo original (Bucket).' }, { status: 500 })
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
            await logError(supabase, 'DB Audit Log Insert', dbError?.message || 'No returned log', fileName)
            return NextResponse.json({ error: 'Error al iniciar registro de auditoría (DB).' }, { status: 500 })
        }

        const importId = importLog.id

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

        let transactions: any[] = []
        let warnings: string[] = []
        let reviewItems: ReviewItem[] = []

        if (fileName.endsWith('.csv') || fileName.endsWith('.txt') || fileName.endsWith('.dat')) {
            const text = buffer.toString('utf-8')
            const res = parseText(text, orgId, fileName.endsWith('.csv') ? ',' : undefined)
            transactions = res.transactions
            warnings = res.warnings
            reviewItems = res.reviewItems
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const res = parseExcel(buffer, orgId)
            transactions = res.transactions
            warnings = res.warnings
            reviewItems = res.reviewItems
        } else if (fileName.endsWith('.pdf')) {
            const pdfData = await pdf(buffer)
            const res = parsePDF(pdfData.text, orgId)
            transactions = res.transactions
            warnings = res.warnings
            reviewItems = res.reviewItems
        } else {
            throw new Error('Formato no soportado')
        }

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
            const transactionsWithLink = transactions.map(t => ({
                ...t,
                archivo_importacion_id: importId
            }))

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

            const existingSet = new Set(existing?.map(e => `${e.fecha}-${e.descripcion}-${e.monto}`))
            const uniqueTransactions = transactionsWithLink.filter(t => !existingSet.has(`${t.fecha}-${t.descripcion}-${t.monto}`))

            if (uniqueTransactions.length > 0) {
                const { error: insError } = await supabase.from('transacciones').insert(uniqueTransactions)
                if (insError) {
                    await supabase.from('archivos_importados').update({ estado: 'error', metadata: { error: insError.message, stage: 'insertion' } }).eq('id', importId)
                    return NextResponse.json({ error: 'Error al guardar datos.' }, { status: 500 })
                }

                await supabase.from('archivos_importados').update({
                    estado: 'completado',
                    metadata: { processed: transactions.length, inserted: uniqueTransactions.length, warnings: warnings.slice(0, 20) }
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
                await supabase.from('archivos_importados').update({
                    estado: 'completado',
                    metadata: { processed: transactions.length, inserted: 0, warnings: warnings.slice(0, 20), note: 'All duplicates' }
                }).eq('id', importId)

                return NextResponse.json({ success: true, count: 0, skipped: transactions.length, warnings: warnings.slice(0, 50), message: 'Los datos ya existían en el sistema' })
            }
        }

        // Fallback
        await supabase.from('archivos_importados').update({
            estado: 'completado',
            metadata: { processed: 0, inserted: 0, warnings: warnings.slice(0, 20), note: 'No transactions found' }
        }).eq('id', importId)

        return NextResponse.json({ success: true, count: 0, warnings: warnings.slice(0, 50), message: 'Archivo recibido y archivado, pero no se detectaron transacciones válidas.' })

    } catch (error: any) {
        console.error('Upload processing error:', error)
        try {
            const supabase = await createClient()
            await logError(supabase, 'Unhandled Exception', error.message, fileName)
        } catch (e) { }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

async function logError(supabase: any, origin: string, message: string, fileName?: string) {
    try {
        await supabase.from('error_logs').insert({
            nivel: 'error',
            origen: `api/upload/${origin}`,
            mensaje: message,
            metadata: { file: fileName }
        })
    } catch (e) {
        console.error('Logging failed:', e)
    }
}

// --- Parsers ---

function parseText(text: string, orgId: string, delimiter?: string): { transactions: any[], warnings: string[], reviewItems: any[] } {
    const lines = text.split('\n')
    const transactions = []
    let warnings: string[] = []
    let reviewItems: any[] = []

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
        const findCuit = (p: string[]) => p.find(s => s.match(/^\d{2}-?\d{8}-?\d{1}$/))

        let fecha: string | null = null
        let monto = 0
        let descripcion = 'Importado sin descripción'
        let cuit = findCuit(parts) || null

        for (const p of parts) {
            const f = normalizeDate(p.trim())
            if (f) { fecha = f; break; }
        }

        for (const p of parts) {
            const stripped = p.replace(/[^0-9.,-]/g, '')
            if (stripped.match(/^-?\d+([.,]\d+)?$/) && !p.includes('/') && !p.includes('-') && !p.includes(':')) {
                let val: number
                if (stripped.includes(',') && stripped.includes('.')) {
                    val = parseFloat(stripped.replace(/\./g, '').replace(',', '.'))
                } else if (stripped.includes(',')) {
                    val = parseFloat(stripped.replace(',', '.'))
                } else {
                    val = parseFloat(stripped)
                }

                if (!isNaN(val) && Math.abs(val) > 0.01) {
                    monto = val
                    break;
                }
            }
        }

        if (parts.length >= 3) {
            const f = normalizeDate(parts[0].trim())
            if (f) {
                fecha = f
                descripcion = parts[1].trim()
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
            if (line.match(/\d/) && line.length > 5) {
                reviewItems.push({
                    organization_id: orgId,
                    datos_crudos: { line: line, source: 'text_parser', lineNumber: i + 1 },
                    motivo: 'Formato no reconocido (posible fecha/monto inválido)',
                    estado: 'pendiente',
                    descripcion: line.substring(0, 100)
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

    if (headerRowIndex === -1 && jsonData.length > 0) {
        headerRowIndex = -1
        colMap = { date: 0, desc: 1, amount: 2, cuit: 3 }
    }

    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (!row || row.length === 0) continue

        if (colMap.date > -1 && colMap.amount > -1) {
            let rawDate = row[colMap.date]
            let fecha = ''
            if (typeof rawDate === 'number') {
                const dateObj = XLSX.SSF.parse_date_code(rawDate)
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
            } else if (row.some(c => c)) {
                reviewItems.push({
                    organization_id: orgId,
                    datos_crudos: { row: row, sheet: firstSheetName, rowIndex: i },
                    motivo: 'Fila con datos pero fecha/monto no identificados',
                    estado: 'pendiente'
                })
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
    const dateRegexStart = /^(\d{2}[/-]\d{2}[/-]\d{2,4})/

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        const match = trimmed.match(dateRegexStart)

        let parsed = false
        if (match) {
            const dateStr = match[1]
            const rest = trimmed.substring(match[0].length).trim()
            const amountMatch = rest.match(/(-?[\d\.,]+)$/)

            if (amountMatch) {
                const amountStr = amountMatch[1]
                const descripcion = rest.substring(0, rest.length - amountStr.length).trim()
                let monto = 0
                if (amountStr.includes(',') && amountStr.includes('.')) {
                    monto = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'))
                } else if (amountStr.includes(',')) {
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

function normalizeDate(dateStr: string): string {
    try {
        if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) return dateStr
        const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-')
        if (parts.length === 3) {
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
