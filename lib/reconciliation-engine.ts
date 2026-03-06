import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * RECONCILIATION ENGINE v3.1
 * Purpose: Smart matching of bank transactions with pending treasury invoices.
 * Strategy: Funnel (Reduction) + Subset Sum (1-a-N).
 */
export class ReconciliationEngine {
    static async matchAndReconcile(supabase: any, organizationId: string, options?: { dryRun?: boolean, scope?: 'admin' | 'bank' | 'all' }) {
        const dryRun = options?.dryRun ?? false;
        const scope = options?.scope ?? 'all';
        const adminSupabase = createAdminClient();
        console.log(`[RECONCILIATION v3.1] Starting auto-match for org: ${organizationId} (dryRun: ${dryRun}, scope: ${scope})`)

        // 1. PHASE 0: Repair Orphaned Transactions (linked but stuck in 'pendiente')
        console.log(`[RECONCILIATION] Phase 0: Checking for orphans...`)
        const { data: orphans } = await adminSupabase
            .from('transacciones')
            .select('id, monto, monto_usado')
            .eq('organization_id', organizationId)
            .not('movimiento_id', 'is', null)
            .eq('estado', 'pendiente');

        if (!dryRun && orphans && orphans.length > 0) {
            console.log(`[RECONCILIATION] Found ${orphans.length} orphans. Synching state...`)
            for (const orph of orphans) {
                const total = Math.abs(Number(orph.monto));
                const used = Number(orph.monto_usado || 0);
                const isFullyUsed = used >= total - 0.05;

                await adminSupabase
                    .from('transacciones')
                    .update({ estado: isFullyUsed ? 'conciliado' : 'parcial' })
                    .eq('id', orph.id)
                    .eq('organization_id', organizationId);
            }
        }

        // --- NEW: PHASE 1: Administrative Sync (Invoices <-> Receipts/OP) ---
        let adminMatches = 0;
        if (!dryRun && (scope === 'admin' || scope === 'all')) {
            adminMatches = await this.matchAdministrative(supabase, organizationId);
        }

        // If we only wanted admin match, we stop here
        if (scope === 'admin') {
            console.log(`[RECONCILIATION] Scope 'admin' finished. Matched: ${adminMatches}`);
            return { matched: adminMatches, actions: [] };
        }

        // 2. Fetch DATA FOR PHASE 2 (Bank Phase)
        // We fetch it HERE so we see the changes made by Phase 1
        const { data: pendingInvoices, error: invError } = await adminSupabase
            .from('comprobantes')
            .select('*')
            .eq('organization_id', organizationId)
            .in('tipo', ['factura_venta', 'factura_compra', 'nota_debito', 'nota_credito', 'ingreso_vario', 'egreso_vario'])
            .neq('estado', 'conciliado')
            .or('monto_pendiente.is.null,monto_pendiente.gt.0')
            .order('fecha_vencimiento', { ascending: true })

        if (invError || !pendingInvoices) {
            console.log(`[RECONCILIATION] Warning: No pending invoices found in database.`);
        }

        const invoicesList = pendingInvoices || [];

        const { data: pendingMovements } = await adminSupabase
            .from('instrumentos_pago')
            .select('*, movimientos_tesoreria(*, entidades(*), aplicaciones_pago(comprobante_id, comprobantes(nro_factura))))')
            .eq('organization_id', organizationId)
            .in('estado', ['pendiente', 'parcial'])
            .order('fecha_disponibilidad', { ascending: true });

        console.log(`[RECONCILIATION] Phase 2: Fetched ${invoicesList.length} invoices and ${pendingMovements?.length || 0} payment instruments.`);

        // 3. Fetch unlinked bank transactions
        const { data: pendingTrans, error: transError } = await adminSupabase
            .from('transacciones')
            .select('*')
            .eq('organization_id', organizationId)
            .in('estado', ['pendiente', 'parcial'])

        if (transError || !pendingTrans || pendingTrans.length === 0) {
            console.log(`[RECONCILIATION] No unlinked transactions found.`)
            return { matched: 0, actions: [], repaired: orphans?.length || 0 }
        }

        // 3. Fetch Trust Ledger
        let trustLedgerMap = new Map<string, string>();
        try {
            const { data: pastMatches } = await adminSupabase
                .rpc('get_trust_ledger', { org_id: organizationId });

            if (pastMatches) {
                pastMatches.forEach((m: any) => trustLedgerMap.set(m.cbu, m.cuit));
            }
        } catch (e) {
            console.warn('[RECONCILIATION] Trust Ledger RPC failed.');
        }

        let matchedCount = 0
        const results: any[] = []

        for (const trans of pendingTrans) {
            const totalBankAmount = Math.abs(Number(trans.monto));
            const previouslyUsed = Number(trans.monto_usado || 0);
            const availableTransAmount = totalBankAmount - previouslyUsed;

            if (availableTransAmount <= 0.05) continue;

            const isCobro = trans.monto > 0;
            const targetTipos = isCobro
                ? ['factura_venta', 'nota_debito', 'ingreso_vario']
                : ['factura_compra', 'nota_credito', 'egreso_vario'];

            let targetInvoices: any[] = invoicesList.filter((i: any) => targetTipos.includes(i.tipo));
            let matchLevel = 0;

            // Anomalies
            let tags: string[] = trans.tags || [];
            let anomalyFound = false;

            if (totalBankAmount > 5000000 && !tags.includes('alerta_precio')) {
                tags.push('alerta_precio');
                anomalyFound = true;
            }

            const mentionCBU = trans.descripcion?.match(/CBU\s*(\d{22})/i);
            if (mentionCBU && mentionCBU[1] && !trustLedgerMap.has(mentionCBU[1]) && !tags.includes('riesgo_bec')) {
                tags.push('riesgo_bec');
                anomalyFound = true;
            }

            const normalizeCuit = (cuit: string | undefined | null) => cuit ? cuit.replace(/\D/g, '') : '';
            const txCuitNormalized = normalizeCuit(trans.cuit);

            // Funnel - Intentamos determinar el nivel de confianza y restringir las facturas
            // pero si algo falla, no queremos perder un posible match por monto exacto.
            let fallbackInvoices = [...targetInvoices];

            if (txCuitNormalized) {
                const exactCuitInvoices = targetInvoices.filter(i => normalizeCuit(i.cuit_socio) === txCuitNormalized);
                if (exactCuitInvoices.length > 0) {
                    targetInvoices = exactCuitInvoices;
                    matchLevel = 1;
                }
            } else if (trans.metadata?.cbu && trustLedgerMap.has(trans.metadata.cbu)) {
                const deducedCuit = normalizeCuit(trustLedgerMap.get(trans.metadata.cbu));
                const exactCuitInvoices = targetInvoices.filter(i => normalizeCuit(i.cuit_socio) === deducedCuit);
                if (exactCuitInvoices.length > 0) {
                    targetInvoices = exactCuitInvoices;
                    matchLevel = 2;
                }
            } else {
                const fuzzyClientCuit = this.findClientByFuzzy(trans.descripcion || '', invoicesList);
                if (fuzzyClientCuit) {
                    const exactCuitInvoices = targetInvoices.filter(i => normalizeCuit(i.cuit_socio) === normalizeCuit(fuzzyClientCuit));
                    if (exactCuitInvoices.length > 0) {
                        targetInvoices = exactCuitInvoices;
                        matchLevel = 3;
                    }
                }
            }

            // Si el funnel filtró TODO y nos quedamos en cero, restauramos las facturas iniciales para intentar match exacto por monto.
            if (targetInvoices.length === 0) {
                targetInvoices = fallbackInvoices;
                matchLevel = 4;
            }

            let finalMatch: any[] | null = null;
            let finalMovementMatch: any = null;

            // --- STRATEGY A: Existing Movements (Receipts/OPs) ---
            if (pendingMovements && pendingMovements.length > 0) {
                const isCobro = trans.monto > 0;
                const targetMovements = pendingMovements.filter((m: any) => {
                    const movType = m.movimientos_tesoreria?.tipo;
                    return isCobro ? movType === 'cobro' : movType === 'pago';
                });

                // 1-a-1 Exact Movement Match
                const movementMatch = targetMovements.find((m: any) => {
                    const mAmount = Math.abs(Number(m.monto || 0));
                    const currentAvailable = Math.abs(Number(availableTransAmount || 0));
                    // Relaxed amount check: ignore decimals / rounding differences up to 1.5
                    const amountMatches = Math.floor(mAmount) === Math.floor(currentAvailable) || Math.abs(mAmount - currentAvailable) <= 1.5;

                    if (!amountMatches) return false;

                    const mov = m.movimientos_tesoreria;
                    const movEntidad = mov?.entidades;
                    const descUpper = (trans.descripcion || '').toUpperCase();

                    // 0. Check Payment Reference Match (Ej: Numero de cheque, numero de transferencia que detalla el recibo)
                    let hasPaymentRefMatch = false;
                    const memRef = (m.detalle_referencia || '').toUpperCase().trim();
                    if (memRef && memRef.length >= 4) {
                        // Buscamos si la referencia del recibo está textualmente en el banco
                        if (descUpper.includes(memRef) || (trans.numero_cheque && trans.numero_cheque.toUpperCase().includes(memRef))) {
                            hasPaymentRefMatch = true;
                        } else {
                            // Intentamos solo con los números de la referencia (ej: de "TRF-1234" buscamos "1234")
                            const refNums = memRef.replace(/\D/g, '');
                            if (refNums.length >= 4 && descUpper.includes(refNums)) {
                                hasPaymentRefMatch = true;
                            }
                        }
                    }

                    // --- EVALUACIÓN FINAL DE COINCIDENCIA DE 1 A 1 ---
                    const transDescClean = this.normalizeReference(trans.descripcion || '');
                    const instrRefClean = this.normalizeReference(m.detalle_referencia || '');

                    console.log(`[RECONCILIATION] Testing match: Trans(${trans.id}, amt:${availableTransAmount}) [CleanDesc: ${transDescClean}] vs Mov(${m.id}, amt:${mAmount}) [CleanRef: ${instrRefClean}]`);

                    // 1. Check if CLEAN REF is contained in CLEAN DESC (High confidence)
                    if (instrRefClean && instrRefClean.length >= 3 && transDescClean.includes(instrRefClean)) {
                        console.log(`[RECONCILIATION] >> MATCH FOUND: Reference ${instrRefClean} found in description ${transDescClean}`);
                        return true;
                    }

                    // 1b. EXTRA: Literal check for numbers (To catch references like '123' inside 'TRF-123')
                    const rawInstrRef = (m.detalle_referencia || '').trim();
                    if (rawInstrRef && rawInstrRef.length >= 3 && descUpper.includes(rawInstrRef.toUpperCase())) {
                        console.log(`[RECONCILIATION] >> MATCH FOUND: Literal Reference ${rawInstrRef} found in description`);
                        return true;
                    }

                    // 1c. RELAXED: Compare pure numeric digits if literal match failed (e.g. TRF-123456 -> 123456)
                    const refNumsOnly = rawInstrRef.replace(/\D/g, '');
                    if (refNumsOnly && refNumsOnly.length >= 4 && descUpper.includes(refNumsOnly)) {
                        console.log(`[RECONCILIATION] >> MATCH FOUND: Numeric Reference ${refNumsOnly} found in description`);
                        return true;
                    }

                    // 2. Check if Bank Check Number matches
                    if (trans.numero_cheque && m.detalle_referencia && trans.numero_cheque.includes(m.detalle_referencia)) {
                        console.log(`[RECONCILIATION] >> MATCH FOUND: Check Number Match!`);
                        return true;
                    }

                    // 3. Verificamos si hay referencias de factura vinculadas al movimiento
                    if (mov?.aplicaciones_pago && Array.isArray(mov.aplicaciones_pago)) {
                        for (const app of mov.aplicaciones_pago) {
                            const compNum = app.comprobantes?.nro_factura;
                            if (compNum) {
                                // Buscamos tanto la versión normalizada como el número final (ej: '1234' de 'FAC-0001-1234')
                                const cleanFact = this.normalizeReference(compNum);
                                const lastDigits = compNum.split('-').pop()?.replace(/^0+/, '');

                                if ((cleanFact && cleanFact.length >= 4 && transDescClean.includes(cleanFact)) ||
                                    (lastDigits && lastDigits.length >= 4 && transDescClean.includes(lastDigits))) {
                                    console.log(`[RECONCILIATION] >> MATCH FOUND: Invoice ${compNum} Match!`);
                                    return true;
                                }
                            }
                        }
                    }

                    // 4. Fallback: CUIT match (Only if monto matches and we have CUIT)
                    if (txCuitNormalized && movEntidad?.cuit && normalizeCuit(movEntidad.cuit) === txCuitNormalized) {
                        console.log(`[RECONCILIATION] >> MATCH FOUND: CUIT Match!`);
                        return true;
                    }

                    // 4b. Relaxed: Exact Amount match for null references
                    if (Math.abs(availableTransAmount - mAmount) < 0.05 && (!m.detalle_referencia || m.detalle_referencia === '')) {
                        console.log(`[RECONCILIATION] >> MATCH FOUND: Exact Amount Match for NULL Reference!`);
                        return true;
                    }

                    // 5. Fallback: Razon Social (Last resort)
                    const razonSocial = (movEntidad?.razon_social || '').toUpperCase();
                    if (razonSocial && razonSocial !== 'CONSUMIDOR FINAL') {
                        const words = razonSocial.split(/\s+/).filter((w: string) => w.length >= 3);
                        if (words.some((w: string) => descUpper.includes(w))) {
                            console.log(`[RECONCILIATION] >> MATCH FOUND: Razon Social Match!`);
                            return true;
                        }
                    }

                    return false;
                });

                if (movementMatch) {
                    finalMovementMatch = [movementMatch]; // Convert to array for unified handling
                    matchLevel = 1;
                } else if (targetMovements.length > 1 && targetMovements.length <= 15) {
                    // 1-a-N Movement Match (Agrupación de recibos en un solo depósito)
                    const subsetMatch = this.findSubsetSum(targetMovements, availableTransAmount, 'monto');
                    if (subsetMatch) {
                        finalMovementMatch = subsetMatch;
                        matchLevel = 2;
                        console.log(`[RECONCILIATION] >> BATCH MATCH FOUND: ${subsetMatch.length} movements sum exactly to balance!`);
                    }
                }
            }

            // --- STRATEGY B: Invoices (Subset Sum) ---
            if (!finalMovementMatch && targetInvoices.length > 0) {
                // 1-a-1 Relaxed Match
                const singleMatch = targetInvoices.find(i => {
                    const iPending = Math.abs(Number(i.monto_pendiente));
                    return Math.floor(iPending) === Math.floor(availableTransAmount) || Math.abs(iPending - availableTransAmount) <= 1.5;
                });
                if (singleMatch) {
                    finalMatch = [singleMatch];
                }
                // 1-a-N
                else if (targetInvoices.length <= 15) {
                    finalMatch = this.findSubsetSum(targetInvoices, availableTransAmount);
                }
                // Partial Pay Match Level 1/2 (Single Invoice)
                if (!finalMatch && matchLevel <= 2 && targetInvoices.length === 1) {
                    finalMatch = [targetInvoices[0]];
                }
            }

            if ((finalMatch || finalMovementMatch) && matchLevel <= 4) {
                console.log(`[RECONCILIATION] Match Level ${matchLevel} found for trans ${trans.id} (${availableTransAmount} avail.)`);

                // In dryRun mode, just record the match without writing to DB
                if (dryRun) {
                    matchedCount++;
                    results.push({
                        transId: trans.id,
                        transDesc: trans.descripcion,
                        monto: availableTransAmount,
                        invoiceIds: finalMatch ? finalMatch.map((i: any) => i.id) : [],
                        movementIds: finalMovementMatch ? finalMovementMatch.map((m: any) => m.movimiento_id) : [],
                        level: matchLevel,
                        auto: true
                    });
                    continue;
                }

                try {
                    // IDEMPOTENCY CHECK: Refresh transaction status from origin before writing
                    const { data: currentTx } = await adminSupabase
                        .from('transacciones')
                        .select('movimiento_id, estado, monto_usado')
                        .eq('id', trans.id)
                        .single();

                    if (!currentTx || currentTx.movimiento_id || currentTx.estado === 'conciliado') {
                        console.log(`[RECONCILIATION] Skipping trans ${trans.id} - already processed by concurrent request.`);
                        continue;
                    }

                    const previouslyUsedRefreshed = Number(currentTx.monto_usado || 0);

                    // CASE 1: MATCH WITH EXISTING MOVEMENT(S)
                    if (finalMovementMatch && finalMovementMatch.length > 0) {
                        const movementIds = finalMovementMatch.map((m: any) => m.movimiento_id);
                        const instrumentIds = finalMovementMatch.map((m: any) => m.id);

                        // 1. Update EVERY instrument of these movements to 'acreditado'
                        await adminSupabase
                            .from('instrumentos_pago')
                            .update({ estado: 'acreditado' })
                            .in('movimiento_id', movementIds);

                        // 1.b Propagate 'conciliado' state to linked invoices for ALL movements
                        const { data: apps } = await adminSupabase
                            .from('aplicaciones_pago')
                            .select('comprobante_id')
                            .in('movimiento_id', movementIds);

                        if (apps && apps.length > 0) {
                            const invoiceIds = apps.map(a => a.comprobante_id);
                            const { error: propError } = await adminSupabase
                                .from('comprobantes')
                                .update({ estado: 'conciliado' })
                                .in('id', invoiceIds);

                            if (propError) console.error(`[RECONCILIATION] Error propagating 'conciliado' state:`, propError.message);
                        }

                        // 2. Link Transaction
                        const newMontoUsado = previouslyUsedRefreshed + availableTransAmount;
                        const isFullyUsed = newMontoUsado >= totalBankAmount - 0.05;

                        await adminSupabase
                            .from('transacciones')
                            .update({
                                movimiento_id: movementIds[0], // Reference the first one for tracking
                                estado: isFullyUsed ? 'conciliado' : 'parcial',
                                monto_usado: newMontoUsado,
                                tags,
                                metadata: {
                                    ...((trans as any).metadata || {}),
                                    linked_at: new Date().toISOString(),
                                    link_method: 'auto_batch_match',
                                    all_movement_ids: movementIds
                                }
                            })
                            .eq('id', trans.id)
                            .eq('organization_id', organizationId);

                        matchedCount++;
                        results.push({
                            transId: trans.id,
                            monto: availableTransAmount,
                            movimientoId: movementIds[0],
                            allMovementIds: movementIds,
                            level: matchLevel,
                            auto: true,
                            type: 'movement'
                        });
                        continue;
                    }

                    // CASE 2: MATCH WITH INVOICES (Traditional Flow - DEPRECATED for Auto)
                    // PIVOT ARQUITECTÓNICO: Ya no creamos recibos/órdenes de pago automáticamente
                    // para evitar duplicidad. Se registran como sugerencias para que el usuario 
                    // los confirme manualmente desde el panel de conciliación.
                    if (finalMatch && finalMatch.length > 0) {
                        console.log(`[RECONCILIATION] Pivot: Recording invoice match suggestion for Tx ${trans.id}.`);
                        results.push({
                            transId: trans.id,
                            transDesc: trans.descripcion,
                            monto: availableTransAmount,
                            invoiceIds: finalMatch.map(i => i.id),
                            level: matchLevel,
                            auto: false, // Mark as manual to prevent auto-creation in background
                            metadata: {
                                ...(trans.metadata || {}),
                                suggestion_source: 'subset_sum_exact',
                                suggested_at: new Date().toISOString()
                            }
                        });
                        continue;
                    }

                } catch (err: any) {
                    console.error(`[RECONCILIATION] Failed to execute circuit for trans ${trans.id}:`, err.message);
                }
            } else {
                // SUGGESTIONS OR ANOMALIES
                if (anomalyFound && !dryRun) {
                    await supabase
                        .from('transacciones')
                        .update({ tags })
                        .eq('id', trans.id)
                        .eq('organization_id', organizationId);
                }

                if (finalMatch) {
                    results.push({
                        transId: trans.id,
                        transDesc: trans.descripcion,
                        monto: availableTransAmount,
                        invoiceIds: finalMatch.map(i => i.id),
                        level: matchLevel,
                        auto: false
                    });
                } else {
                    const timeMatch = this.findMatchByProximity(trans, targetInvoices);
                    if (timeMatch) {
                        results.push({
                            transId: trans.id,
                            transDesc: trans.descripcion,
                            monto: availableTransAmount,
                            invoiceIds: [timeMatch.id],
                            level: 4,
                            auto: false
                        });
                    }
                }
            }
        }

        console.log(`[RECONCILIATION] Finished. Admin Matched: ${adminMatches}. Bank Matched: ${matchedCount}. Total Results: ${results.length}`);
        return { matched: matchedCount + adminMatches, actions: results };
    }

    private static findClientByFuzzy(desc: string, invoices: any[]): string | null {
        const normalizedDesc = desc.toLowerCase();
        for (const inv of invoices) {
            if (inv.razon_social_socio) {
                const words = inv.razon_social_socio.toLowerCase().split(' ').filter((w: string) => w.length > 3);
                if (words.length > 0 && normalizedDesc.includes(words[0])) {
                    return inv.cuit_socio;
                }
            }
        }
        return null;
    }

    private static findMatchByProximity(trans: any, invoices: any[]) {
        const transDate = new Date(trans.fecha);
        const transAmount = Math.abs(Number(trans.monto)) - Number(trans.monto_usado || 0);

        return invoices.find(inv => {
            const invDate = new Date(inv.fecha_vencimiento || inv.fecha_emision);
            const diffDays = Math.abs(invDate.getTime() - transDate.getTime()) / (1000 * 3600 * 24);
            return diffDays <= 3 && Math.abs(Number(inv.monto_pendiente) - transAmount) < 0.05;
        });
    }

    private static findSubsetSum(items: any[], target: number, amountField: string = 'monto_pendiente'): any[] | null {
        const n = items.length;
        const memo = new Map<string, any[] | null>();

        function backtrack(index: number, currentSum: number, selected: any[]): any[] | null {
            const state = `${index}-${currentSum.toFixed(2)}`;
            if (memo.has(state)) return memo.get(state) || null;

            if (Math.abs(currentSum - target) < 0.05) return selected;
            if (index >= n || currentSum > target + 0.05) return null;

            // Option 1: Include item
            const withItem = backtrack(index + 1, currentSum + Number(items[index][amountField] || 0), [...selected, items[index]]);
            if (withItem) {
                memo.set(state, withItem);
                return withItem;
            }

            // Option 2: Skip item
            const withoutItem = backtrack(index + 1, currentSum, selected);
            memo.set(state, withoutItem);
            return withoutItem;
        }

        return backtrack(0, 0, []);
    }

    private static async matchAdministrative(supabase: any, organizationId: string): Promise<number> {
        console.log(`[RECONCILIATION] Starting Administrative Phase (Invoices <-> Receipts/OP)`);
        const adminSupabase = createAdminClient();
        let matched = 0;

        // 1. Fetch movements that might need linking (cobros/pagos)
        const { data: movements } = await adminSupabase
            .from('movimientos_tesoreria')
            .select('*, aplicaciones_pago(id)')
            .eq('organization_id', organizationId)
            .order('fecha', { ascending: true });

        // 2. Fetch pending invoices (Saldo > 0 or NULL which means unpaid)
        const { data: invoices } = await adminSupabase
            .from('comprobantes')
            .select('*')
            .eq('organization_id', organizationId)
            .or('monto_pendiente.is.null,monto_pendiente.gt.0')
            .order('fecha_emision', { ascending: true });

        if (!movements || !invoices) {
            console.log(`[RECONCILIATION] Administrative Phase: No candidates found. (Movements: ${movements?.length || 0}, Invoices: ${invoices?.length || 0})`);
            return 0;
        }

        console.log(`[RECONCILIATION] Administrative Phase: Testing ${movements.length} movements against ${invoices.length} invoices.`);

        for (const mov of movements) {
            // Skip if already has applications
            if (mov.aplicaciones_pago && mov.aplicaciones_pago.length > 0) continue;

            const movAmount = Math.abs(Number(mov.monto_total || 0));
            if (movAmount === 0) continue;

            const isRecibo = mov.tipo === 'cobro';
            const targetType = isRecibo ? 'factura_venta' : 'factura_compra';

            // WE LOOK INTO BOTH CONCEPT AND OBSERVATIONS
            const searchText = ((mov.concepto || '') + ' ' + (mov.observaciones || '') + ' ' + (mov.nro_comprobante || '')).toUpperCase();

            // Try to find matching invoice
            const matchingInvoice = invoices.find(inv => {
                if (inv.tipo !== targetType && inv.estado !== 'pagado') return false; // Relaxed filter for 'pagado'

                // If amount_pending is null, assume total amount
                const pending = Math.abs(inv.monto_pendiente !== null ? Number(inv.monto_pendiente) : Number(inv.monto_total || 0));

                // Match amount (Relaxed: ignore decimals / rounding differences up to 1.5)
                if (Math.floor(pending) !== Math.floor(movAmount) && Math.abs(pending - movAmount) > 1.5) return false;

                const nroFactura = (inv.nro_factura || '').toUpperCase();
                if (!nroFactura) return false;

                const cleanFact = this.normalizeReference(nroFactura);
                const lastDigits = nroFactura.split('-').pop()?.replace(/^0+/, '');

                return searchText.includes(nroFactura) ||
                    (cleanFact && cleanFact.length >= 4 && searchText.includes(cleanFact)) ||
                    (lastDigits && lastDigits.length >= 4 && searchText.includes(lastDigits));
            });

            if (matchingInvoice) {
                console.log(`[RECONCILIATION] >> ADMIN MATCH FOUND: Mov ${mov.id} ($${movAmount}) -> Inv ${matchingInvoice.id} (${matchingInvoice.numero})`);

                try {
                    // 1. Create Application
                    const { error: appError } = await adminSupabase
                        .from('aplicaciones_pago')
                        .insert({
                            organization_id: organizationId,
                            movimiento_id: mov.id,
                            comprobante_id: matchingInvoice.id,
                            monto_aplicado: movAmount // Correct column name is monto_aplicado
                        });

                    if (appError) throw new Error(`Insert Application: ${appError.message}`);

                    // 2. Update Invoice Status
                    const currentPending = Math.abs(matchingInvoice.monto_pendiente !== null ? Number(matchingInvoice.monto_pendiente) : Number(matchingInvoice.monto_total || 0));
                    const newMontoPendiente = Math.max(0, currentPending - movAmount);
                    const isFullyPaid = newMontoPendiente <= 0.05;

                    // Administrative phase marks as 'pagado' (for AR/AP sync)
                    // The 'conciliado' state is reserved for Bank Sync
                    const newEstado = isFullyPaid ? 'pagado' : matchingInvoice.estado;

                    const { error: compError } = await adminSupabase
                        .from('comprobantes')
                        .update({
                            monto_pendiente: newMontoPendiente,
                            estado: newEstado
                        })
                        .eq('id', matchingInvoice.id);

                    if (compError) throw new Error(`Update Invoice: ${compError.message}`);

                    // Update local object to avoid double matching
                    matchingInvoice.monto_pendiente = newMontoPendiente;
                    matched++;
                } catch (e: any) {
                    console.error(`[RECONCILIATION] Error applying admin match for mov ${mov.id}:`, e.message);
                }
            }
        }

        console.log(`[RECONCILIATION] Administrative Phase Completed. Links created: ${matched}`);
        return matched;
    }

    private static normalizeReference(ref: string): string {
        if (!ref) return '';
        const upper = ref.toUpperCase().trim();
        // Solo despojar prefijos si la referencia resultante tiene sentido
        const stripped = upper.replace(/^(TRF|TRANSF|TRANSFERENCIA|CHQ|CHEQUE|DEP|DEPOSITO|RECIBO|RE|OP|PAGO|COBRO)[:\s-]*/i, '');
        const final = stripped.length >= 3 ? stripped : upper;
        return final.replace(/[^A-Z0-9]/gi, '').trim();
    }
}
