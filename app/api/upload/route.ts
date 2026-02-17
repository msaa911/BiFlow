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
                const res = parseFixed(text, format.reglas)
                transactions = res.transactions
                warnings = res.warnings || []
                reviewItems = res.reviewItems
            } else {
                console.log('Format not found, falling back to auto-detect')
            }
        }

        if (transactions.length === 0 && reviewItems.length === 0) {
            // Only run auto-detect if custom format didn't yield results (or wasn't provided)
            if (fileName.endsWith('.csv') || fileName.endsWith('.txt') || fileName.endsWith('.dat')) {
                const text = buffer.toString('utf-8')
                // Use Universal Translator
                const { UniversalTranslator } = require('@/lib/universal-translator')
                const uniTransactions = UniversalTranslator.translate(text, { invertSigns })

                hasExplicitTipo = uniTransactions.hasExplicitTipo
                exampleRow = uniTransactions.exampleRow

                // --- PRIORITY 2 LOGIC: INTERRUPT IF NO EXPLICIT TIPO AND NO CONFIRMATION ---
                if (!hasExplicitTipo && !hasConfirmedSign && uniTransactions.transactions.length > 0) {
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
                        tags: t.tags,
                        moneda: 'ARS',
                        origen_dato: 'universal_translator',
                        estado: 'pendiente'
                    }))
                    // Add balance check warnings if any
                    if (uniTransactions.metadata?.isBalanced === false) {
                        warnings.push(`Advertencia de Saldo: El total de movimientos no coincide con los saldos detectados (Dif: $${uniTransactions.metadata.diferencia?.toFixed(2)})`)
                    }
                } else {
                    console.log('Universal Translator yielded 0 results, falling back to legacy parser')
                    const res = parseText(text, orgId, fileName.endsWith('.csv') ? ',' : undefined)
                    transactions = res.transactions
                    warnings = res.warnings
                    reviewItems = res.reviewItems
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

        // --- 3.6. Anomaly Detection (Expense Guard) ---
        if (transactions.length > 0) {
            try {
                // Get unique descriptions to check
                const descriptions = [...new Set(transactions.map(t => t.descripcion))]
                if (descriptions.length > 0) {
                    const { data: history } = await currentSupabase.rpc('get_historical_averages', {
                        p_org_id: orgId,
                        p_descriptions: descriptions,
                        p_months_back: 3
                    })

                    if (history && history.length > 0) {
                        // Explicitly type the Map to avoid 'any' issues
                        const historyMap = new Map<string, number>(
                            history.map((h: any) => [h.descripcion, Number(h.avg_monto)])
                        )

                        transactions = transactions.map(t => {
                            const avgRaw = historyMap.get(t.descripcion)

                            // Strict check: avg must be a number
                            if (typeof avgRaw === 'number' && avgRaw !== 0) {
                                // Compare Magnitudes (Absolute values) to handle both Incomes (+) and Expenses (-)
                                const currentAbs = Math.abs(t.monto)
                                const avgAbs = Math.abs(avgRaw)

                                const diff = (currentAbs - avgAbs) / avgAbs

                                if (diff > 0.15) { // 15% deviation in magnitude
                                    return {
                                        ...t,
                                        metadata: {
                                            ...t.metadata,
                                            anomaly: 'price_spike',
                                            anomaly_score: diff,
                                            historical_avg: avgRaw // Keep original signed average for reference
                                        },
                                        tags: [...(t.tags || []), 'alerta_precio']
                                    }
                                }
                            }
                            return t
                        })

                        const anomalies = transactions.filter(t => t.metadata?.anomaly === 'price_spike').length
                        if (anomalies > 0) {
                            warnings.push(`Guardián de Gastos: Se detectaron ${anomalies} transacciones con aumentos inusuales (>15%).`)
                        }
                    }
                }
            } catch (err: any) {
                console.error('Anomaly Detection Error:', err)
                // Non-critical, continue
            }
        }

        // --- 3.7. Deduplication (Intelligent) ---
        // Validate against existing DB records using normalized fuzzy logic
        if (transactions.length > 0) {
            try {
                // Ensure we send only necessary fields to RPC
                const candidates = transactions.map(t => ({
                    fecha: t.fecha,
                    monto: t.monto,
                    descripcion: t.descripcion
                }))

                const { data: duplicates } = await currentSupabase.rpc('check_potential_duplicates', {
                    p_candidates: candidates
                })

                if (duplicates && duplicates.length > 0) {
                    const duplicateIndices = new Set(duplicates.map((d: any) => d.candidate_idx))

                    transactions = transactions.map((t, idx) => {
                        if (duplicateIndices.has(idx)) {
                            // Find match info
                            const match = duplicates.find((d: any) => d.candidate_idx === idx)
                            return {
                                ...t,
                                metadata: {
                                    ...t.metadata,
                                    duplicate_warning: true,
                                    match_id: match.match_id
                                },
                                tags: [...(t.tags || []), 'posible_duplicado']
                            }
                        }
                        return t
                    })

                    warnings.push(`Deduplicación: Se detectaron ${duplicateIndices.size} posibles duplicados. Se han etiquetado para revisión.`)
                }
            } catch (err: any) {
                console.error('Deduplication Check Error:', err)
            }
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
                // SANITIZATION: Strict Allow-List of columns to prevent 'concepto' or other extra fields from leaking
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
                    tags: t.tags || [], // Ensure tags are passed
                    metadata: t.metadata || {}
                }))

                console.log('DEBUG: First transaction keys:', Object.keys(sanitizedTransactions[0]))

                const { error: insError } = await currentSupabase.from('transacciones').insert(sanitizedTransactions)
                if (insError) {
                    await currentSupabase.from('archivos_importados').update({ estado: 'error', metadata: { error: insError.message } }).eq('id', importId)
                    console.error('Insert Error Full:', insError)
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
                message: `OK: ${uniqueTransactions.length} procesados.`,
                warnings: warnings.slice(0, 10), // Limit warnings
                balanceCheck: transactions[0]?.origen_dato === 'universal_translator' && transactions.length > 0
                    ? (transactions as any).metadata // Access metadata if attached (needs better piping)
                    : undefined
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

        let fecha: string | null = null
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
            } else {
                // Pattern 2: Fixed Width (Interbanking / DAT)
                // Often starts with 01 + YYYYMMDD. Regex: Optional 01, then YYYYMMDD.
                const compactDate = trimmed.match(/(?:01)?(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/)
                if (compactDate) {
                    fecha = `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`
                }
            }

            // Amount Search 1: Try standard end-of-line match
            const amountMatch = trimmed.match(/(-?[\d\.,]+)$/)
            if (fecha && amountMatch) {
                const rawAmount = amountMatch[1]
                if (!rawAmount.includes('.') && !rawAmount.includes(',') && rawAmount.length > 15) {
                    monto = 0
                } else {
                    monto = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'))
                    descripcion = trimmed.replace(fecha, '').replace(rawAmount, '').trim() || 'Desconocido'
                }
            }

            // Amount Search 2: Deep Search in Numeric Blocks
            if (fecha && monto === 0) {
                const numberBlocks = trimmed.split(/[^0-9,-]+/).filter(s => s.length > 0)
                const dateCleaned = fecha?.replace(/-/g, '') || ''

                const candidates = numberBlocks.filter(b => !b.includes(dateCleaned))

                let amountCandidate = candidates.find(c => c.length >= 6 && c.length <= 18)

                if (!amountCandidate) {
                    const longBlock = candidates.find(c => c.length > 18)
                    if (longBlock) {
                        amountCandidate = longBlock.substring(0, 10)
                    }
                }

                if (amountCandidate) {
                    monto = parseFloat(amountCandidate) / 100
                    descripcion = trimmed.replace(fecha.replace(/-/g, ''), '').replace(amountCandidate, '').trim()
                    descripcion = descripcion.replace(/\d{10,}/g, '')
                    descripcion = descripcion.replace(/^\d+/, '')
                    descripcion = descripcion.trim() || 'Desconocido'
                }
            }
        }

        if (fecha && !isNaN(monto) && monto !== 0) {
            transactions.push({
                organization_id: orgId,
                fecha,
                descripcion: descripcion.substring(0, 100), // trunc
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
                    fecha: fecha || undefined,
                    monto: monto !== 0 ? monto : undefined,
                    descripcion: descripcion || undefined,
                    motivo: fecha ? 'Monto no confirmado (Revisar)' : 'No se pudo parsear fecha',
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
