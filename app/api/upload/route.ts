import { createClient } from '@/lib/supabase/server'
// BI-FLOW ENGINE v5.1 - Intelligence Unified - Forensic Sync
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { AuditEngine } from '@/lib/audit-logic'
import { TrustLedger } from '@/lib/trust-ledger'
import { AnomalyEngine } from '@/lib/anomaly-engine'
import { runAnalysis } from '@/lib/analysis/engine'
import { UniversalTranslator } from '@/lib/universal-translator'

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

        // --- 3. Parse Content (Peeking before committing to Storage/DB) ---
        console.log('8. Parsing Content')
        let transactions: any[] = []
        let warnings: string[] = []
        let reviewItems: any[] = []
        let hasExplicitTipo = true // Default to true to bypass check for non-CSV
        let exampleRow: any = null

        const formatId = formData.get('formatId') as string
        const invertSigns = formData.get('invertSigns') === 'true'
        const hasConfirmedSign = formData.has('invertSigns')
        const uploadContext = (formData.get('context') || 'bank') as 'bank' | 'income' | 'expense'

        if (formatId) {
            console.log(`9. Using Custom Format: ${formatId}`)
            const { data: format } = await currentSupabase
                .from('formato_archivos')
                .select('reglas')
                .eq('id', formatId)
                .single()

            if (format) {
                const { parseFixed } = require('@/lib/parsers/fixed-width')
                const text = buffer.toString('utf-8')
                console.log(`DEBUG: Custom Parser Input Length: ${text.length}`)
                // Fetch Thesaurus for normalization
                const { data: thesaurusRows } = await currentSupabase.from('financial_thesaurus').select('raw_pattern, normalized_concept')
                const thesaurusMap = new Map<string, string>(thesaurusRows?.map((r: any) => [r.raw_pattern, r.normalized_concept]) || [])

                const res = parseFixed(text, format.reglas, { thesaurus: thesaurusMap })
                console.log(`DEBUG: Custom Parser Result - Trans: ${res.transactions?.length}, Review: ${res.reviewItems?.length}`)

                // --- FIX: Map and Enrich Custom Format Results ---
                transactions = res.transactions.map((t: any) => {
                    const concepto = t.concepto || 'Sin concepto'
                    const tags = [...(t.tags || [])]

                    return {
                        ...t,
                        organization_id: orgId,
                        descripcion: concepto,
                        tags,
                        estado: 'pendiente'
                    }
                })

                reviewItems = res.reviewItems.map((r: any) => ({
                    ...r,
                    organization_id: orgId
                }))

                warnings = res.warnings || []
            } else {
                console.log('Format not found, falling back to auto-detect')
            }
        }

        if (transactions.length === 0 && reviewItems.length === 0) {
            // Only run auto-detect if custom format didn't yield results (or wasn't provided)
            if (fileName.endsWith('.csv') || fileName.endsWith('.txt') || fileName.endsWith('.dat')) {
                const text = buffer.toString('utf-8')
                // Fetch Thesaurus for normalization
                const { data: thesaurusRows } = await currentSupabase.from('financial_thesaurus').select('raw_pattern, normalized_concept')
                const thesaurusMap = new Map<string, string>(thesaurusRows?.map((r: any) => [r.raw_pattern, r.normalized_concept]) || [])

                // Use Universal Translator
                const uniTransactions = UniversalTranslator.translate(text, { invertSigns, thesaurus: thesaurusMap })

                hasExplicitTipo = uniTransactions.hasExplicitTipo
                exampleRow = uniTransactions.exampleRow

                // --- PRIORITY 2 LOGIC: INTERRUPT IF NO EXPLICIT TIPO AND NO CONFIRMATION ---
                if (!hasExplicitTipo && !hasConfirmedSign && uniTransactions.transactions.length > 0 && uploadContext === 'bank') {
                    console.log('NOTICE: Missing Tipo column, requiring user confirmation.')
                    return NextResponse.json({
                        status: 'requires_confirmation',
                        exampleRow: uniTransactions.exampleRow,
                        message: 'No detectamos columna de Crédito/Débito. Por favor confirma el sentido de los signos.'
                    }, { status: 409 }) // Conflict - requires user decision
                }

                if (uniTransactions.transactions.length > 0) {
                    transactions = uniTransactions.transactions.map((t: any) => ({
                        organization_id: orgId,
                        fecha: t.fecha,
                        descripcion: t.concepto || 'Sin concepto', // Map concepto -> descripcion
                        monto: t.monto,
                        cuit: t.cuit,
                        razon_social: t.razon_social,
                        vencimiento: t.vencimiento,
                        numero: t.numero,
                        tags: t.tags || [],
                        moneda: 'ARS',
                        origen_dato: 'universal_translator',
                        estado: 'pendiente'
                    }))
                    // Add balance check warnings if any (only for bank statements)
                    if (uploadContext === 'bank' && uniTransactions.metadata?.isBalanced === false) {
                        warnings.push(`Advertencia de Saldo: El total de movimientos no coincide con los saldos detectados (Dif: $${uniTransactions.metadata.diferencia?.toFixed(2)})`)
                    }
                } else if (uniTransactions.transactions.length === 0 && !hasConfirmedSign) {
                    console.log('Universal Translator yielded 0 results, requiring manual training')
                    return NextResponse.json({
                        status: 'requires_confirmation',
                        message: 'No logramos detectar el formato automáticamente. Por favor entrena el modelo.',
                        requiresTraining: true
                    }, { status: 409 })
                }

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
        }

        // --- 4. Now that we have data and confirmation, commit to Storage and DB ---
        console.log('10. Uploading to Storage')
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

        console.log('11. Creating Audit Log Entry')
        const { data: importLog, error: dbLogErr } = await currentSupabase
            .from('archivos_importados')
            .insert({
                organization_id: orgId,
                nombre_archivo: fileName,
                storage_path: storagePath,
                estado: 'procesando',
                metadata: {
                    size: buffer.length,
                    type: file.type,
                    hasExplicitTipo,
                    signsInverted: invertSigns
                }
            })
            .select()
            .single()

        if (dbLogErr || !importLog) {
            console.error('DB Log Error:', dbLogErr)
            return NextResponse.json({ error: 'Error al registrar auditoría.' }, { status: 500 })
        }

        const importId = importLog.id
        console.log(`Audit ID: ${importId}`)

        console.log(`Parsing metadata: ${transactions.length} trans, ${reviewItems.length} review`)

        if (reviewItems && reviewItems.length > 0) {
            const reviewsWithLink = reviewItems.map((r: any) => ({
                ...r,
                archivo_importacion_id: importId
            }))
            await currentSupabase.from('transacciones_revision').insert(reviewsWithLink)
        }

        // --- 3.6. Anomaly Detection (Expense Guard & Duplicates) ---
        // DEPRECATED: Inline detection removed in favor of unified engine


        // --- 4. Store Data & Finish Link ---
        let uniqueCount = 0
        if (transactions.length > 0) {
            const transactionsWithLink = transactions.map((t: any) => ({
                ...t,
                archivo_importacion_id: importId
            }))

            if (uploadContext === 'income' || uploadContext === 'expense') {
                console.log(`[UPLOAD] [TREASURY] Routing ${transactions.length} rows to comprobantes`)
                uniqueCount = transactions.length

                const sanitizedComprobantes = transactionsWithLink.map((t: any) => ({
                    organization_id: t.organization_id,
                    tipo: uploadContext === 'income' ? 'factura_venta' : 'factura_compra',
                    numero: t.numero || `FILE-${importId.substring(0, 6)}`,
                    cuit_socio: t.cuit || '00-00000000-0',
                    razon_social_socio: t.razon_social || t.descripcion,
                    fecha_emision: t.fecha,
                    fecha_vencimiento: t.vencimiento || t.fecha,
                    monto_total: Math.abs(t.monto),
                    monto_pendiente: Math.abs(t.monto),
                    estado: 'pendiente',
                    moneda: t.moneda || 'ARS'
                }))

                const { error: compError } = await currentSupabase
                    .from('comprobantes')
                    .insert(sanitizedComprobantes)

                if (compError) {
                    console.error('[UPLOAD] [TREASURY] Insert Error:', compError)
                    throw new Error(`Error insertion treasury: ${compError.message}`)
                }
            } else {
                // DEFAULT: BANK TRANSACTIONS
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

                const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
                const existingSet = new Set(existing?.map((e: any) => `${e.fecha}-${normalize(e.descripcion)}-${e.monto}`))
                const uniqueTransactions = transactionsWithLink.filter((t: any) => !existingSet.has(`${t.fecha}-${normalize(t.descripcion)}-${t.monto}`))
                uniqueCount = uniqueTransactions.length

                if (uniqueTransactions.length > 0) {
                    const sanitizedTransactions = uniqueTransactions.map((t: any) => ({
                        organization_id: t.organization_id,
                        fecha: t.fecha,
                        descripcion: t.descripcion || 'Sin Descripción',
                        monto: t.monto,
                        cuit: t.cuit || null,
                        moneda: t.moneda || 'ARS',
                        origen_dato: t.origen_dato,
                        estado: t.estado,
                        archivo_importacion_id: t.archivo_importacion_id,
                        tags: t.tags || [],
                        metadata: t.metadata || {}
                    }))

                    const { error: insError } = await currentSupabase
                        .from('transacciones')
                        .insert(sanitizedTransactions)

                    if (insError) throw new Error(`Error insertion: ${insError.message}`)
                }
            }

            await currentSupabase.from('archivos_importados').update({
                estado: 'completado',
                metadata: { processed: transactions.length, inserted: uniqueCount, context: uploadContext, warnings: warnings.slice(0, 20) }
            }).eq('id', importId)

            // Solo ejecutar análisis bancario si el contexto es 'bank'
            let analysisResult = { findings: 0 }
            if (uploadContext === 'bank') {
                console.log(`[UPLOAD] Triggering unified analysis for org: ${orgId}`)
                analysisResult = await runAnalysis(orgId)
            }

            return NextResponse.json({
                success: true,
                count: uniqueCount,
                reviewCount: reviewItems?.length || 0,
                findingsCount: analysisResult.findings || 0,
                message: `OK: ${uniqueCount} procesados.`,
                warnings: warnings.slice(0, 10), // Limit warnings
                balanceCheck: transactions[0]?.origen_dato === 'universal_translator' && transactions.length > 0
                    ? (transactions as any).metadata // Access metadata if attached (needs better piping)
                    : undefined
            })
        }

        if (transactions.length === 0 && reviewItems.length > 0) {
            await currentSupabase.from('archivos_importados').update({
                estado: 'completado',
                metadata: {
                    note: 'Pendiente de Revisión',
                    reviewCount: reviewItems.length
                }
            }).eq('id', importId)

            return NextResponse.json({
                success: true,
                count: 0,
                reviewCount: reviewItems.length,
                message: `Atención: No se insertaron transacciones directas, pero hay ${reviewItems.length} filas pendientes de revisión en la Cuarentena.`
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

async function logError(supabase: any, origin: string, message: string, fileName?: string, orgId?: string) {
    try {
        await supabase.from('error_logs').insert({
            organization_id: orgId || null,
            nivel: 'error',
            origen: `api/upload/${origin}`,
            mensaje: message,
            metadata: { file: fileName }
        })
    } catch (e) { }
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
