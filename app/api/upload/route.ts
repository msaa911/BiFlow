import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
// BI-FLOW ENGINE v5.1 - Intelligence Unified - Forensic Sync
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { AuditEngine } from '@/lib/audit-logic'
import { TrustLedger } from '@/lib/trust-ledger'
import { AnomalyEngine } from '@/lib/anomaly-engine'
import { runAnalysis } from '@/lib/analysis/engine'
import { UniversalTranslator } from '@/lib/universal-translator'
import { ReconciliationEngine } from '@/lib/reconciliation-engine'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    console.log('--- POST START ---')
    let fileName = 'unknown_file'
    let currentSupabase: any = null

    // Use Admin client for archivos_importados state updates (bypasses RLS)
    const adminSupabase = createAdminClient()

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

        if (!orgId) {
            console.error('CRITICAL: No organization context found for user', user.id)
            return NextResponse.json({ error: 'No se pudo determinar la organización del usuario.' }, { status: 403 })
        }

        // --- 3. Parse Content (Peeking before committing to Storage/DB) ---
        console.log('8. Parsing Content')
        let transactions: any[] = []
        let warnings: string[] = []
        let reviewItems: any[] = []
        let hasExplicitTipo = true // Default to true to bypass check for non-CSV
        let exampleRow: any = null

        const formatId = formData.get('formatId') as string
        const manualMapping = formData.get('mapping') as string
        const invertSigns = formData.get('invertSigns') === 'true'
        const hasConfirmedSign = formData.has('invertSigns')
        const uploadContext = (formData.get('context') || 'bank') as 'bank' | 'income' | 'expense' | 'receipt' | 'payment'
        const rawCuentaId = formData.get('cuenta_id') as string
        const cuentaId = (rawCuentaId && rawCuentaId.length > 5) ? rawCuentaId : null
        let uniTransactions: any = null

        if (formatId || manualMapping) {
            console.log(`9. Using ${formatId ? 'Custom Format' : 'Manual Mapping'}`)
            let rules: any = null
            let tipo = 'delimited'

            if (formatId) {
                const { data: format } = await currentSupabase
                    .from('formato_archivos')
                    .select('reglas, tipo')
                    .eq('id', formatId)
                    .single()
                if (format) {
                    rules = format.reglas
                    tipo = format.tipo || 'fixed_width'
                }
            } else if (manualMapping) {
                try {
                    rules = JSON.parse(manualMapping)
                    tipo = 'delimited' // Visual Mapper defaults to delimited for now
                } catch (e) {
                    console.error('Failed to parse manual mapping:', e)
                }
            }

            if (rules) {
                const text = buffer.toString('utf-8');
                const { data: thesaurusRows } = await currentSupabase.from('financial_thesaurus').select('raw_pattern, normalized_concept');
                const thesaurusMap = new Map<string, string>(thesaurusRows?.map((r: any) => [r.raw_pattern, r.normalized_concept]) || []);

                uniTransactions = UniversalTranslator.translate(text, {
                    invertSigns,
                    thesaurus: thesaurusMap,
                    template: { tipo, reglas: rules }
                });

                transactions = uniTransactions.transactions.map((t: any) => ({
                    ...t,
                    monto: t.monto,
                    cuit: t.cuit,
                    numero_cheque: t.numero_cheque,
                    organization_id: orgId,
                    cuenta_id: uploadContext === 'bank' ? cuentaId : null,
                    descripcion: t.concepto || 'Sin concepto',
                    estado: 'pendiente'
                }));

                hasExplicitTipo = uniTransactions.hasExplicitTipo;
                exampleRow = uniTransactions.exampleRow;
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
                uniTransactions = UniversalTranslator.translate(text, { invertSigns, thesaurus: thesaurusMap })

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
                        razon_social: t.razon_social || t.concepto, // Capture full concept if razon_social is empty
                        vencimiento: t.vencimiento,
                        numero: t.numero,
                        numero_cheque: t.numero_cheque,
                        tags: t.tags || [],
                        moneda: 'ARS',
                        origen_dato: 'universal_translator',
                        estado: 'pendiente',
                        cuenta_id: uploadContext === 'bank' ? cuentaId : null,
                        metadata: { ...t.metadata, cbu: t.cbu }
                    }))
                    // Add balance check warnings if any (only for bank statements)
                    if (uploadContext === 'bank' && uniTransactions.metadata?.isBalanced === false) {
                        warnings.push(`Advertencia de Saldo: El total de movimientos no coincide con los saldos detectados (Dif: $${uniTransactions.metadata.diferencia?.toFixed(2)})`)
                    }
                } else if (uniTransactions.transactions.length === 0 && !hasConfirmedSign) {
                    console.log('Universal Translator yielded 0 results, requiring visual mapping')
                    const sampleRows = UniversalTranslator.getSampleRows(text);
                    return NextResponse.json({
                        status: 'requires_mapping',
                        message: 'No logramos detectar el formato automáticamente. Por favor mapea las columnas.',
                        sampleRows,
                        requiresMapping: true
                    }, { status: 422 })
                }

            } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                if (uploadContext === 'receipt' || uploadContext === 'payment') {
                    const type = uploadContext === 'receipt' ? 'cobro' : 'pago'
                    const res = parseTreasuryExcelServer(buffer, orgId, type)
                    transactions = res.transactions
                    warnings = res.warnings
                    reviewItems = res.reviewItems
                } else {
                    const res = parseExcel(buffer, orgId)
                    transactions = res.transactions
                    warnings = res.warnings
                    reviewItems = res.reviewItems
                }
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
        console.log('10. Uploading to Storage (Admin Client)')
        const timestamp = Date.now()
        const dateObj = new Date()
        const year = dateObj.getFullYear()
        const month = String(dateObj.getMonth() + 1).padStart(2, '0')
        const safeFileName = fileName.replace(/[^a-z0-9.-]/gi, '_')
        const storagePath = `${orgId}/${year}/${month}/${timestamp}_${safeFileName}`

        // Use admin client for storage to bypass RLS issues on the bucket
        const { error: storageError } = await adminSupabase.storage
            .from('raw-imports')
            .upload(storagePath, buffer, {
                contentType: file.type,
                upsert: false
            })

        if (storageError) {
            console.error('Storage Upload Error (Admin):', storageError)
            await logError(adminSupabase, 'Storage Upload', storageError.message, fileName, orgId)
            return NextResponse.json({
                error: 'Error de almacenamiento al subir archivo.',
                details: storageError.message,
                path: storagePath
            }, { status: 500 })
        }

        console.log('11. Creating Audit Log Entry [v5.4-ULTRA]')
        const auditPayload: any = {
            organization_id: orgId,
            cuenta_id: cuentaId,
            nombre_archivo: fileName,
            storage_path: storagePath,
            estado: (transactions[0]?.origen_dato === 'universal_translator' && uniTransactions?.metadata?.lowQuality)
                ? 'requiere_ajuste'
                : 'procesando',
            metadata: {
                size: buffer.length,
                type: file.type,
                hasExplicitTipo,
                signsInverted: invertSigns,
                uploadVersion: '5.4-ULTRA'
            }
        };

        const { data: importLog, error: dbLogErr } = await adminSupabase
            .from('archivos_importados')
            .insert(auditPayload)
            .select()
            .single()

        if (dbLogErr || !importLog) {
            console.error('DB Log Error [v5.4-ULTRA]:', dbLogErr)
            const errorMsg = `ERROR AUDIT [v5.4-ULTRA]: ${dbLogErr?.message || 'Sin mensaje'} (Code: ${dbLogErr?.code || 'N/A'})`;
            return NextResponse.json({
                error: errorMsg,
                details: dbLogErr?.message,
                code: dbLogErr?.code,
                diagnostic: { orgId, state: auditPayload.estado }
            }, { status: 500 })
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

            if (uploadContext === 'income' || uploadContext === 'expense' || uploadContext === 'receipt' || uploadContext === 'payment') {
                console.log(`[UPLOAD] [TREASURY] Routing ${transactions.length} rows to ${uploadContext}`)
                uniqueCount = transactions.length

                if (uploadContext === 'income' || uploadContext === 'expense') {
                    // DUPLICATE PREVENTION: Fetch existing invoices to filter
                    const { data: existingInvs } = await currentSupabase
                        .from('comprobantes')
                        .select('nro_factura, cuit_socio, tipo')
                        .eq('organization_id', orgId);

                    const existSet = new Set(existingInvs?.map((e: any) => `${e.tipo}_${e.nro_factura}_${e.cuit_socio}`) || []);

                    const sanitizedComprobantes = transactionsWithLink
                        .filter((t: any) => {
                            const num = t.numero || (t.concepto?.includes('FAC') ? t.concepto : `FILE-${importId.substring(0, 6)}`);
                            const cuit = t.cuit || '00-00000000-0';
                            const tipo = uploadContext === 'income' ? 'factura_venta' : 'factura_compra';
                            return !existSet.has(`${tipo}_${num}_${cuit}`);
                        })
                        .map((t: any) => ({
                            organization_id: t.organization_id || orgId,
                            archivo_importacion_id: importId,
                            tipo: uploadContext === 'income' ? 'factura_venta' : 'factura_compra',
                            nro_factura: t.numero || (t.concepto?.includes('FAC') ? t.concepto : `FILE-${importId.substring(0, 6)}`),
                            cuit_socio: t.cuit || '00-00000000-0',
                            razon_social_socio: t.razon_social || t.concepto || 'Sin Razón Social',
                            nombre_entidad: t.razon_social || t.descripcion || 'Sin Razón Social',
                            banco: t.banco || null,
                            numero_cheque: t.numero_cheque || null,
                            fecha_emision: t.fecha,
                            fecha_vencimiento: t.vencimiento || t.fecha,
                            monto_total: Math.abs(t.monto),
                            monto_pendiente: Math.abs(t.monto),
                            estado: 'pendiente',
                            moneda: t.moneda || 'ARS',
                            metadata: { ...(t.metadata || {}), raw_row: t.raw }
                        }))

                    uniqueCount = sanitizedComprobantes.length

                    if (sanitizedComprobantes.length > 0) {
                        const { error: compError } = await currentSupabase
                            .from('comprobantes')
                            .insert(sanitizedComprobantes)

                        if (compError) {
                            console.error('[UPLOAD] [TREASURY] Insert Error:', compError)
                            throw new Error(`Error insertion treasury: ${compError.message}`)
                        }
                    }
                } else {
                    // RECEIPTS AND PAYMENT ORDERS
                    const isCobro = uploadContext === 'receipt'

                    // 1. Resolve Entities (Entidades)
                    console.log(`[UPLOAD] [TREASURY] Resolving entities for ${transactionsWithLink.length} movements...`)
                    for (const t of transactionsWithLink) {
                        const razonSocial = t.razon_social || t.concepto || 'Sin Razón Social'

                        // Try to find existing entity
                        const { data: existingEntity } = await currentSupabase
                            .from('entidades')
                            .select('id')
                            .eq('organization_id', orgId)
                            .ilike('razon_social', razonSocial)
                            .single()

                        if (existingEntity) {
                            t.entidad_id = existingEntity.id
                        } else {
                            // Create new entity
                            const { data: newEntity, error: createError } = await currentSupabase
                                .from('entidades')
                                .insert({
                                    organization_id: orgId,
                                    razon_social: razonSocial,
                                    categoria: isCobro ? 'cliente' : 'proveedor',
                                    metadata: { origen: 'importacion_tesoreria_automatica' }
                                })
                                .select('id')
                                .single()

                            if (newEntity) {
                                t.entidad_id = newEntity.id
                            } else {
                                console.error('[UPLOAD] [TREASURY] Error creating entity:', createError)
                            }
                        }
                    }

                    // GROUPING LOGIC FOR MIXED PAYMENTS (MULTI-INSTRUMENT)
                    // If multiple rows have the same number, they belong to the same movement
                    const groupedByNum: Record<string, any[]> = {}
                    const ungrouped: any[] = []

                    transactionsWithLink.forEach(t => {
                        if (t.numero) {
                            if (!groupedByNum[t.numero]) groupedByNum[t.numero] = []
                            groupedByNum[t.numero].push(t)
                        } else {
                            ungrouped.push(t)
                        }
                    })

                    // Prepare consolidated movements
                    const movementsToInsert: any[] = []
                    const instrumentDataMap: any[] = [] // Temporary map to link instruments after insert

                    // Process grouped
                    Object.keys(groupedByNum).forEach(num => {
                        const rows = groupedByNum[num]
                        const totalMonto = rows.reduce((acc, r) => acc + Math.abs(r.monto), 0)
                        const firstRow = rows[0]

                        movementsToInsert.push({
                            organization_id: orgId,
                            entidad_id: firstRow.entidad_id || null,
                            tipo: isCobro ? 'cobro' : 'pago',
                            nro_comprobante: num,
                            fecha: firstRow.fecha,
                            monto_total: totalMonto,
                            moneda: firstRow.moneda || 'ARS',
                            observaciones: rows.map(r => r.descripcion || r.razon_social).filter((v, i, a) => a && a.indexOf(v) === i).join(' | '),
                            concepto: firstRow.concepto || firstRow.descripcion || firstRow.razon_social || 'Sin Concepto',
                            metadata: {
                                raw_rows: rows.map(r => r.raw),
                                import_type: uploadContext,
                                archivo_importacion_id: importId,
                                is_mixed_payment: rows.length > 1
                            }
                        })
                        instrumentDataMap.push(rows)
                    })

                    // Process ungrouped (one-to-one)
                    ungrouped.forEach(t => {
                        const num = (isCobro ? 'REC' : 'OP') + '-' + Math.random().toString(36).substring(7).toUpperCase()
                        movementsToInsert.push({
                            organization_id: orgId,
                            entidad_id: t.entidad_id || null,
                            tipo: isCobro ? 'cobro' : 'pago',
                            nro_comprobante: num,
                            fecha: t.fecha,
                            monto_total: Math.abs(t.monto),
                            moneda: t.moneda || 'ARS',
                            observaciones: t.descripcion || t.razon_social,
                            concepto: t.concepto || t.descripcion || t.razon_social,
                            metadata: {
                                raw_row: t.raw,
                                import_type: uploadContext,
                                archivo_importacion_id: importId
                            }
                        })
                        instrumentDataMap.push([t])
                    })

                    uniqueCount = movementsToInsert.length

                    let insertedMovs: any[] = []
                    if (movementsToInsert.length > 0) {
                        const { data, error: movsError } = await currentSupabase
                            .from('movimientos_tesoreria')
                            .insert(movementsToInsert)
                            .select()

                        if (movsError) {
                            console.error('[UPLOAD] [TREASURY] Grouped Movs Insert Error:', movsError)
                            throw new Error(`Error insertion treasury movements: ${movsError.message}`)
                        }
                        insertedMovs = data || []
                    }

                    // Create Instruments for each movement
                    if (insertedMovs.length > 0) {
                        const instrumentsToInsert: any[] = []

                        // FETCH ACCOUNTS FOR MATCHING
                        const { data: accounts } = await adminSupabase
                            .from('cuentas_bancarias')
                            .select('id, nombre, banco')
                            .eq('organization_id', orgId);

                        const findAccountId = (bankName: string) => {
                            if (!bankName || !accounts) return null;
                            const search = bankName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                            const exact = accounts.find(a =>
                                a.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(search) ||
                                a.banco.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(search)
                            );
                            return exact ? exact.id : null;
                        };

                        insertedMovs.forEach((m, idx) => {
                            const originalRows = instrumentDataMap[idx]
                            originalRows.forEach((rawRow: any) => {
                                const matchedAccId = findAccountId(rawRow.banco);
                                instrumentsToInsert.push({
                                    organization_id: orgId,
                                    movimiento_id: m.id,
                                    metodo: rawRow.metadata?.metodo || (isCobro ? 'transferencia' : 'cheque_propio'),
                                    monto: Math.abs(rawRow.monto),
                                    banco: rawRow.banco || rawRow.metadata?.banco || null,
                                    cuenta_id: matchedAccId,
                                    fecha_disponibilidad: rawRow.vencimiento || rawRow.fecha,
                                    detalle_referencia: rawRow.referencia || rawRow.metadata?.referencia || rawRow.numero_cheque || null,
                                    estado: 'pendiente'
                                })
                            })
                        })

                        if (instrumentsToInsert.length > 0) {
                            const { error: insError } = await adminSupabase
                                .from('instrumentos_pago')
                                .insert(instrumentsToInsert)

                            if (insError) {
                                console.error('[UPLOAD] [TREASURY] Instruments Insert Error:', insError)
                            }
                        }
                    }

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
                    .select('fecha, descripcion, monto, numero_cheque')
                    .eq('organization_id', orgId)
                    .gte('fecha', minDate)
                    .lte('fecha', maxDate)

                const normalize = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
                const getHash = (t: any) => `${t.fecha}-${normalize(t.descripcion || t.concepto)}-${t.monto}-${t.numero_cheque || ''}-${t.metadata?.saldo || ''}`;

                // Occurrence-aware de-duplication:
                // We count how many times a transaction (same date, desc, amount, partial hash) exists in DB
                // and we only insert the "delta" from the current file.
                const dbCounts = new Map<string, number>();
                existing?.forEach((e: any) => {
                    const h = getHash(e);
                    dbCounts.set(h, (dbCounts.get(h) || 0) + 1);
                });

                const fileCounts = new Map<string, number>();
                const uniqueTransactions = transactionsWithLink.filter((t: any) => {
                    const hash = getHash(t);
                    const currentFileCount = (fileCounts.get(hash) || 0) + 1;
                    fileCounts.set(hash, currentFileCount);

                    const currentDbCount = dbCounts.get(hash) || 0;

                    // If this is the N-th time we see this hash in the file, 
                    // and we already have at least N in the DB, skip it.
                    if (currentFileCount <= currentDbCount) return false;

                    return true;
                });
                uniqueCount = uniqueTransactions.length

                if (uniqueTransactions.length > 0) {
                    const sanitizedTransactions = uniqueTransactions.map((t: any) => ({
                        organization_id: t.organization_id,
                        fecha: t.fecha,
                        descripcion: t.descripcion || t.concepto || 'Sin Descripción',
                        monto: t.monto,
                        cuit: t.cuit || null,
                        moneda: t.moneda || 'ARS',
                        numero_cheque: t.numero_cheque || null,
                        origen_dato: t.origen_dato,
                        estado: t.estado,
                        archivo_importacion_id: t.archivo_importacion_id,
                        cuenta_id: t.cuenta_id || (uploadContext === 'bank' ? cuentaId : null),
                        tags: t.tags || [],
                        metadata: {
                            ...(t.metadata || {}),
                            referencia: t.referencia || null
                        }
                    }))

                    const { error: insError } = await currentSupabase
                        .from('transacciones')
                        .insert(sanitizedTransactions)

                    if (insError) throw new Error(`Error insertion: ${insError.message}`)
                }
            }

            await adminSupabase.from('archivos_importados').update({
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
            await adminSupabase.from('archivos_importados').update({
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

        await adminSupabase.from('archivos_importados').update({ estado: 'completado', metadata: { note: 'No data' } }).eq('id', importId)
        return NextResponse.json({ success: true, count: 0, message: 'Archivo procesado sin transacciones.' })

    } catch (error: any) {
        console.error('FATAL ERROR:', error)
        try {
            if (currentSupabase && fileName !== 'unknown_file') {
                // Determine importId if possible (it might not have been created yet)
                // We'll try to find the latest "procesando" record for this file/org if importId is missing
                // But safer to just look at the variable.
                const { data: latest } = await currentSupabase
                    .from('archivos_importados')
                    .select('id')
                    .eq('nombre_archivo', fileName)
                    .eq('estado', 'procesando')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single()

                const targetId = latest?.id

                if (targetId) {
                    await adminSupabase.from('archivos_importados').update({
                        estado: 'error',
                        metadata: { fatal_error: error.message }
                    }).eq('id', targetId)
                }

                await logError(currentSupabase, 'Unhandled Exception', error.message, fileName)
            }
        } catch (e) {
            console.error('Logging/State fix failed in catch:', e)
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


function parseTreasuryExcelServer(buffer: Buffer, orgId: string, type: 'cobro' | 'pago') {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const targetSheetName = workbook.SheetNames.find(n =>
        /recibos|pagos|cobros|ordenes|tesoreria|plantilla/i.test(n)
    ) || workbook.SheetNames[0]

    const data = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheetName]) as any[]
    const transactions: any[] = []
    const reviewItems: any[] = []

    for (const row of data) {
        if (!row || Object.keys(row).length < 2) continue

        const keys = Object.keys(row)
        const getValue = (pattern: RegExp, isDate: boolean = false) => {
            const foundKey = keys.find(k => {
                const nk = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                return pattern.test(nk)
            })
            if (!foundKey) return ''
            const val = row[foundKey]

            if (isDate && typeof val === 'number') {
                const d = new Date(Math.round((val - 25569) * 864e5))
                return d.toISOString().split('T')[0]
            }
            return String(val).trim()
        }

        const fecha = getValue(/fecha|^fec$/i, true)
        const numero = getValue(/numero|nro|n°|comprobante|recibo|orden/i)
        const razonSocial = getValue(/entidad|cliente|proveedor|razon|social|nombre/i)
        const montoRaw = getValue(/monto|total|importe|valor/i)
        const monto = parseFloat(montoRaw.replace(/[^\d.,-]/g, '').replace(',', '.'))
        const medioRaw = getValue(/medio|metodo|instrumento|forma/i)
        const medio = (medioRaw || 'Efectivo').toLowerCase().replace(' ', '_')
        const banco = getValue(/banco|entidad bancaria/i)
        const referencia = getValue(/referencia|ref|cheque|transf|detalle/i)
        const disponibilidad = getValue(/disponibilidad|acreditacion/i, true)
        const observaciones = getValue(/observaciones|obs|notas|cancelacion|^concepto$/i)

        if (!numero && isNaN(monto)) continue

        let itemErrors = []
        if (!fecha) itemErrors.push('Falta Fecha')
        if (!razonSocial) itemErrors.push('Falta Entidad')
        if (isNaN(monto)) itemErrors.push('Monto inválido')

        if (itemErrors.length === 0) {
            transactions.push({
                fecha,
                monto,
                numero: numero || null,
                concepto: observaciones || razonSocial,
                razon_social: razonSocial,
                vencimiento: disponibilidad,
                banco,
                numero_cheque: referencia,
                referencia: referencia, // Ensure it's in the top level
                metadata: {
                    metodo: medio,
                    referencia,
                }
            })
        } else {
            reviewItems.push({ organization_id: orgId, datos_crudos: { row: Object.values(row) }, motivo: 'Mapping failed: ' + itemErrors.join(', '), estado: 'pendiente' })
        }
    }

    return { transactions, warnings: [], reviewItems }
}


function parseExcel(buffer: Buffer, orgId: string) {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][]
    const transactions: any[] = []
    const reviewItems: any[] = []

    // Detect header row to skip it (Improved Logic)
    let headerIdx = -1;
    const headerKeywords = ['fecha', 'date', 'monto', 'desc', 'referencia', 'importe', 'concepto'];

    // Check first 10 rows for header
    for (let i = 0; i < Math.min(data.length, 10); i++) {
        const row = data[i];
        if (!row || row.length < 2) continue;
        const rowStr = row.join(' ').toLowerCase();
        // If at least 2 keywords match, it's likely the header
        if (headerKeywords.filter(k => rowStr.includes(k)).length >= 2) {
            headerIdx = i;
            break;
        }
    }

    const dataRows = headerIdx !== -1 ? data.slice(headerIdx + 1) : data;

    for (const row of dataRows) {
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
    if (!str) return null;
    let clean = String(str).replace(/[^\d/.-]/g, '');

    // Soporte para YYYYMMDD
    if (clean.length === 8 && /^\d{8}$/.test(clean)) {
        return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
    }

    const parts = clean.split(/[/-]/).filter(p => p.length > 0);
    if (parts.length === 3) {
        let [p1, p2, p3] = parts;
        // Caso 1: AAAA-MM-DD
        if (p1.length === 4) return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;

        // Caso 2: DD/MM/AAAA o DD-MM-AA
        if (p1.length <= 2 && p3.length >= 2) {
            if (p3.length === 2) p3 = `20${p3}`;
            return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
        }
    }
    return null;
}

async function getOrgId(supabase: any, userId: string) {
    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', userId).single()
    if (member) return member.organization_id

    // Use RPC to bypass RLS issues during creation
    const { data: orgId, error } = await supabase.rpc('create_new_organization', { org_name: 'Mi Empresa' })
    if (error) throw new Error(`Could not create org: ${error.message}`)
    return orgId
}
