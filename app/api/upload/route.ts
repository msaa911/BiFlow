import { createClient } from '@/lib/supabase/server'
// Rebuild force - timestamp 1612 - breadcrumbs added
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    console.log('--- POST START ---')
    let fileName = 'unknown_file'
    let currentSupabase: any = null

    try {
        console.log('1. Parsing Form Data')
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            console.log('Err: No file')
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
        }

        fileName = file.name.toLowerCase()
        console.log(`2. File detected: ${fileName} (${file.size} bytes)`)

        console.log('3. Initializing Supabase')
        currentSupabase = await createClient()
        const { data: { user } } = await currentSupabase.auth.getUser()

        if (!user) {
            console.log('Err: No user')
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        console.log('4. Converting to Buffer')
        const buffer = Buffer.from(await file.arrayBuffer())

        console.log('5. Getting Org ID')
        const orgId = await getOrgId(currentSupabase, user.id)
        console.log(`Org ID obtained: ${orgId}`)

        // --- 1. Upload Raw File to Storage ---
        console.log('6. Uploading to Storage')
        const timestamp = Date.now()
        const dateObj = new Date()
        const year = dateObj.getFullYear()
        const month = String(dateObj.getMonth() + 1).padStart(2, '0')
        const safeFileName = fileName.replace(/[^a-z0-9.-]/gi, '_')
        const storagePath = `${orgId}/${year}/${month}/${timestamp}_${safeFileName}`

        const { error: storageError } = await currentSupabase.storage
            .from('raw-imports')
            .upload(storagePath, buffer, {
                contentType: file.type,
                upsert: false
            })

        if (storageError) {
            console.error('Storage Upload Error:', storageError)
            await logError(currentSupabase, 'Storage Upload', storageError.message, fileName)
            return NextResponse.json({ error: `Error Storage: ${storageError.message}` }, { status: 500 })
        }

        // --- 2. Create Audit Log ---
        console.log('7. Creating Audit Log Entry')
        const { data: importLog, error: dbError } = await currentSupabase
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
            await logError(currentSupabase, 'DB Audit Log Insert', dbError?.message || 'No returned log', fileName)
            return NextResponse.json({ error: 'Error al iniciar registro de auditoría (DB).' }, { status: 500 })
        }

        const importId = importLog.id
        console.log(`Audit ID: ${importId}`)

        // --- 3. Parse Content ---
        console.log('8. Parsing Content')
        let transactions: any[] = []
        let warnings: string[] = []
        let reviewItems: any[] = []

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
            console.log('Loading pdf-parse dynamically')
            const pdf = require('pdf-parse')
            const pdfData = await pdf(buffer)
            const res = parsePDF(pdfData.text, orgId)
            transactions = res.transactions
            warnings = res.warnings
            reviewItems = res.reviewItems
        } else {
            throw new Error('Formato no soportado')
        }

        console.log(`Parsing metadata: ${transactions.length} trans, ${reviewItems.length} review`)

        // --- 3.5. Insert Review Items ---
        if (reviewItems && reviewItems.length > 0) {
            const reviewsWithLink = reviewItems.map((r: any) => ({
                ...r,
                archivo_importacion_id: importId
            }))
            await currentSupabase.from('transacciones_revision').insert(reviewsWithLink)
        }

        // --- 4. Store Data & Finish Link ---
        if (transactions.length > 0) {
            const transactionsWithLink = transactions.map((t: any) => ({
                ...t,
                archivo_importacion_id: importId
            }))

            let minDate = transactionsWithLink[0].fecha
            let maxDate = transactionsWithLink[0].fecha
            transactionsWithLink.forEach((t: any) => {
                if (t.fecha < minDate) minDate = t.fecha
                if (t.fecha > maxDate) maxDate = t.fecha
            })

            const { data: existing } = await currentSupabase
                .from('transacciones')
                .select('fecha, descripcion, monto')
                .eq('organization_id', orgId)
                .gte('fecha', minDate)
                .lte('fecha', maxDate)

            const existingSet = new Set(existing?.map((e: any) => `${e.fecha}-${e.descripcion}-${e.monto}`))
            const uniqueTransactions = transactionsWithLink.filter((t: any) => !existingSet.has(`${t.fecha}-${t.descripcion}-${t.monto}`))

            if (uniqueTransactions.length > 0) {
                const { error: insError } = await currentSupabase.from('transacciones').insert(uniqueTransactions)
                if (insError) {
                    await currentSupabase.from('archivos_importados').update({ estado: 'error', metadata: { error: insError.message } }).eq('id', importId)
                    throw new Error(`Error insertion: ${insError.message}`)
                }
            }

            await currentSupabase.from('archivos_importados').update({
                estado: 'completado',
                metadata: { processed: transactions.length, inserted: uniqueTransactions.length, warnings: warnings.slice(0, 20) }
            }).eq('id', importId)

            return NextResponse.json({
                success: true,
                count: uniqueTransactions.length,
                reviewCount: reviewItems?.length || 0,
                message: `OK: ${uniqueTransactions.length} procesados.`
            })
        }

        await currentSupabase.from('archivos_importados').update({ estado: 'completado', metadata: { note: 'No data' } }).eq('id', importId)
        return NextResponse.json({ success: true, count: 0, message: 'Archivo procesado sin transacciones.' })

    } catch (error: any) {
        console.error('FATAL ERROR:', error)
        try {
            if (currentSupabase) {
                await logError(currentSupabase, 'Unhandled Exception', error.message, fileName)
            }
        } catch (e) {
            console.error('Logging failed in catch:', e)
        }

        return NextResponse.json({
            error: 'Internal server error',
            details: error.message || 'Unknown error',
            fileName: fileName
        }, { status: 500 })
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
    } catch (e) { }
}

function parseText(text: string, orgId: string, delimiter?: string) {
    const lines = text.split('\n')
    const transactions = []
    let warnings: string[] = []
    let reviewItems: any[] = []
    const actualDelimiter = delimiter || (text.includes(';') ? ';' : ',')

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        let fecha = null
        let monto = 0
        let descripcion = ''

        // Strategy A: Delimited
        const parts = trimmed.split(actualDelimiter)
        if (parts.length >= 2 && actualDelimiter !== ',') { // Safety check: comma text might just be text
            fecha = normalizeDate(parts[0])
            const mPart = parts.find((p, i) => i > 0 && p.match(/^-?\d+([.,]\d+)?$/))
            if (mPart) {
                monto = parseFloat(mPart.replace(',', '.'))
                descripcion = parts[1] === mPart ? (parts[2] || 'Sin descripción') : parts[1]
            }
        }

        // Strategy B: Regex for Fixed Width / Weird Formats
        if (!fecha || monto === 0) {
            // Pattern 1: DD/MM/YYYY or YYYY-MM-DD
            const standardDate = trimmed.match(/(\d{2}[/-]\d{2}[/-]\d{2,4})/)
            if (standardDate) {
                fecha = normalizeDate(standardDate[1])
            }

            // Pattern 2: Fixed Width YYYYMMDD (Common in banks like Interbanking)
            // Looks for 202[0-9] followed by MM DD. e.g. "0120251101..."
            // We look for a block of 8 digits starting with 202
            else {
                const compactDate = trimmed.match(/(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/)
                if (compactDate) {
                    // compactDate[1] = Year, [2] = Month, [3] = Day
                    fecha = `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`
                }
            }

            // Amount Search
            const amountMatch = trimmed.match(/(-?[\d\.,]+)$/)
            if (fecha && amountMatch) {
                const rawAmount = amountMatch[1]
                // If it looks like a huge integer (e.g. 00000005658630 without separators), we treat it as review item because we don't know decimals
                if (!rawAmount.includes('.') && !rawAmount.includes(',') && rawAmount.length > 10) {
                    // Ambiguous huge number -> Quarantine
                    monto = 0
                } else {
                    monto = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'))
                    descripcion = trimmed.replace(fecha, '').replace(rawAmount, '').trim() || 'Desconocido'
                }
            }

            if (fecha && monto === 0) {
                descripcion = trimmed
            }
        }

        if (fecha && !isNaN(monto) && monto !== 0) {
            transactions.push({
                organization_id: orgId,
                fecha,
                descripcion: descripcion.substring(0, 100),
                monto,
                origen_dato: 'text',
                moneda: 'ARS',
                estado: 'pendiente'
            })
        } else {
            if (reviewItems.length < 50) {
                reviewItems.push({
                    organization_id: orgId,
                    datos_crudos: { line: trimmed },
                    motivo: fecha ? 'Monto no detectado (Posible formato fijo)' : 'No se pudo parsear fecha',
                    estado: 'pendiente'
                })
            }
        }
    }
    return { transactions, warnings, reviewItems }
}

function parseExcel(buffer: Buffer, orgId: string) {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][]
    const transactions: any[] = []
    const reviewItems: any[] = []

    for (const row of data) {
        if (!row || row.length < 2) continue
        let fecha: string | null = ''
        if (typeof row[0] === 'number') {
            const d = XLSX.SSF.parse_date_code(row[0])
            fecha = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
        } else {
            fecha = normalizeDate(String(row[0]))
        }

        let monto = typeof row[2] === 'number' ? row[2] : parseFloat(String(row[2] || '0').replace(/[^0-9.-]/g, ''))
        let desc = String(row[1] || 'Excel Row')

        if (fecha && !isNaN(monto) && monto !== 0) {
            transactions.push({ organization_id: orgId, fecha, descripcion: desc, monto, origen_dato: 'excel', moneda: 'ARS', estado: 'pendiente' })
        } else if (row.some(c => c)) {
            reviewItems.push({ organization_id: orgId, datos_crudos: { row }, motivo: 'Mapping failed', estado: 'pendiente' })
        }
    }
    return { transactions, warnings: [], reviewItems }
}

function parsePDF(text: string, orgId: string) {
    const transactions: any[] = []
    const reviewItems: any[] = []
    const lines = text.split('\n')
    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length < 10) continue
        const match = trimmed.match(/^(\d{2}[/-]\d{2}[/-]\d{2,4})/)
        if (match) {
            const fecha = normalizeDate(match[1])
            const amountMatch = trimmed.match(/(-?[\d\.,]+)$/)
            if (fecha && amountMatch) {
                const monto = parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.'))
                transactions.push({ organization_id: orgId, fecha, descripcion: trimmed.substring(0, 50), monto, origen_dato: 'pdf', moneda: 'ARS', estado: 'pendiente' })
                continue
            }
        }
        reviewItems.push({ organization_id: orgId, datos_crudos: { line: trimmed }, motivo: 'PDF logic fail', estado: 'pendiente' })
    }
    return { transactions, warnings: [], reviewItems }
}

function normalizeDate(str: string) {
    const p = str.split(/[/-]/)
    if (p.length !== 3) return null
    let y = p[2].length === 2 ? `20${p[2]}` : p[2]
    return `${y}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`
}

async function getOrgId(supabase: any, userId: string) {
    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', userId).single()
    if (member) return member.organization_id

    // Use RPC to bypass RLS issues during creation
    const { data: orgId, error } = await supabase.rpc('create_new_organization', { org_name: 'Mi Empresa' })
    if (error) throw new Error(`Could not create org: ${error.message}`)
    return orgId
}
