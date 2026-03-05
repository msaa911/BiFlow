import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * RECONCILIATION ENGINE v3.1
 * Purpose: Smart matching of bank transactions with pending treasury invoices.
 * Strategy: Funnel (Reduction) + Subset Sum (1-a-N).
 */
export class ReconciliationEngine {
    static async matchAndReconcile(supabase: any, organizationId: string, options?: { dryRun?: boolean }) {
        const dryRun = options?.dryRun ?? false;
        const adminSupabase = createAdminClient();
        console.log(`[RECONCILIATION v3.1] Starting auto-match for org: ${organizationId} (dryRun: ${dryRun})`)

        // --- NEW: PHASE -1: Administrative Sync (Invoices <-> Receipts/OP) ---
        let adminMatches = 0;
        if (!dryRun) {
            adminMatches = await this.matchAdministrative(supabase, organizationId);
        }

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

        // 2. Fetch pending invoices (AP/AR) -> Order by due date to apply FIFO if multiple
        const { data: pendingInvoices, error: invError } = await adminSupabase
            .from('comprobantes')
            .select('*')
            .eq('organization_id', organizationId)
            .in('tipo', ['factura_venta', 'factura_compra', 'nota_debito', 'nota_credito', 'ingreso_vario', 'egreso_vario'])
            .neq('estado', 'conciliado') // Fetch everything not already finalized
            .or('monto_pendiente.is.null,monto_pendiente.gt.0')
            .order('fecha_vencimiento', { ascending: true })

        if (invError || !pendingInvoices) {
            console.log(`[RECONCILIATION] Warning: No pending invoices found in database.`);
        }

        const invoicesList = pendingInvoices || [];

        // 2.b Fetch pending movements (Receipts/OPs)
        const { data: pendingMovements } = await adminSupabase
            .from('instrumentos_pago')
            .select('*, movimientos_tesoreria(*, entidades(*), aplicaciones_pago(comprobante_id, comprobantes(numero)))')
            .eq('organization_id', organizationId)
            .in('estado', ['pendiente', 'parcial'])
            .order('fecha_disponibilidad', { ascending: true });

        console.log(`[RECONCILIATION] Fetched ${pendingMovements?.length || 0} pending payment instruments.`);

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
                    const amountMatches = Math.abs(mAmount - currentAvailable) < 0.05;

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
                    if (instrRefClean && instrRefClean.length >= 4 && transDescClean.includes(instrRefClean)) {
                        console.log(`[RECONCILIATION] >> MATCH FOUND: Reference ${instrRefClean} found in description ${transDescClean}`);
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
                            const compNum = app.comprobantes?.numero;
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

                    // 5. Fallback: Razon Social (Last resort)
                    const razonSocial = (movEntidad?.razon_social || '').toUpperCase();
                    if (razonSocial) {
                        const words = razonSocial.split(/\s+/).filter((w: string) => w.length > 3);
                        if (words.some((w: string) => descUpper.includes(w))) {
                            console.log(`[RECONCILIATION] >> MATCH FOUND: Razon Social Match!`);
                            return true;
                        }
                    }

                    return false;
                });

                if (movementMatch) {
                    finalMovementMatch = movementMatch;
                    matchLevel = 1; // Movement matches are high confidence
                }
            }

            // --- STRATEGY B: Invoices (Subset Sum) ---
            if (!finalMovementMatch && targetInvoices.length > 0) {
                // 1-a-1 Exact Match
                const singleMatch = targetInvoices.find(i => Math.abs(Number(i.monto_pendiente) - availableTransAmount) < 0.05);
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
                        movementId: finalMovementMatch ? finalMovementMatch.movimiento_id : null,
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

                    // CASE 1: MATCH WITH EXISTING MOVEMENT
                    if (finalMovementMatch) {
                        const movId = finalMovementMatch.movimiento_id;

                        // 1. Update Instrument state
                        await adminSupabase
                            .from('instrumentos_pago')
                            .update({ estado: 'acreditado' })
                            .eq('id', finalMovementMatch.id);

                        // 1.b Propagate 'conciliado' state to linked invoices
                        const { data: apps } = await adminSupabase
                            .from('aplicaciones_pago')
                            .select('comprobante_id')
                            .eq('movimiento_id', movId);

                        if (apps && apps.length > 0) {
                            const invoiceIds = apps.map(a => a.comprobante_id);
                            await adminSupabase
                                .from('comprobantes')
                                .update({ estado: 'conciliado' })
                                .in('id', invoiceIds);
                        }

                        // 2. Link Transaction
                        const newMontoUsado = previouslyUsedRefreshed + availableTransAmount;
                        const isFullyUsed = newMontoUsado >= totalBankAmount - 0.05;

                        await adminSupabase
                            .from('transacciones')
                            .update({
                                movimiento_id: movId,
                                estado: isFullyUsed ? 'conciliado' : 'parcial',
                                monto_usado: newMontoUsado,
                                tags
                            })
                            .eq('id', trans.id)
                            .eq('organization_id', organizationId);

                        matchedCount++;
                        results.push({
                            transId: trans.id,
                            monto: availableTransAmount,
                            movimientoId: movId,
                            level: matchLevel,
                            auto: true,
                            type: 'movement'
                        });
                        continue;
                    }

                    // CASE 2: MATCH WITH INVOICES (Traditional Flow - DEPRECATED)
                    // PIVOT ARQUITECTÓNICO: Ya no creamos recibos/órdenes de pago automáticamente
                    // basándonos solo en facturas. En su lugar, simplemente lo pasamos como sugerencia.
                    if (finalMatch && finalMatch.length > 0) {
                        console.log(`[RECONCILIATION] Pivot: Skipping auto-creation for invoice match on Tx ${trans.id}. Added as suggestion.`);
                        results.push({
                            transId: trans.id,
                            transDesc: trans.descripcion,
                            monto: availableTransAmount,
                            invoiceIds: finalMatch.map(i => i.id),
                            level: matchLevel,
                            auto: false
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

    private static findSubsetSum(invoices: any[], target: number): any[] | null {
        const tolerance = 0.05;
        const n = invoices.length;

        function backtrack(idx: number, currentSum: number, selected: any[]): any[] | null {
            if (Math.abs(currentSum - target) < tolerance) return selected;
            if (currentSum > target + tolerance || idx >= n) return null;

            for (let i = idx; i < n; i++) {
                const result = backtrack(i + 1, currentSum + Number(invoices[i].monto_pendiente), [...selected, invoices[i]]);
                if (result) return result;
            }
            return null;
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
            const searchText = ((mov.concepto || '') + ' ' + (mov.observaciones || '') + ' ' + (mov.numero || '')).toUpperCase();

            // Try to find matching invoice
            const matchingInvoice = invoices.find(inv => {
                if (inv.tipo !== targetType && !['cobrado', 'pagado'].includes(inv.estado)) return false; // Relaxed filter for 'cobrado'/'pagado'

                // If amount_pending is null, assume total amount
                const pending = Math.abs(inv.monto_pendiente !== null ? Number(inv.monto_pendiente) : Number(inv.monto_total || 0));

                // Match amount (allow 1-to-1 exact)
                if (Math.abs(pending - movAmount) > 0.05) return false;

                const nroFactura = (inv.numero || '').toUpperCase();
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
                    await adminSupabase
                        .from('aplicaciones_pago')
                        .insert({
                            organization_id: organizationId,
                            movimiento_id: mov.id,
                            comprobante_id: matchingInvoice.id,
                            monto: movAmount
                        });

                    // 2. Update Invoice Status
                    const currentPending = Math.abs(matchingInvoice.monto_pendiente !== null ? Number(matchingInvoice.monto_pendiente) : Number(matchingInvoice.monto_total || 0));
                    const newMontoPendiente = Math.max(0, currentPending - movAmount);
                    const isFullyPaid = newMontoPendiente <= 0.05;
                    const newEstado = isFullyPaid ? (isRecibo ? 'cobrado' : 'pagado') : matchingInvoice.estado;

                    await adminSupabase
                        .from('comprobantes')
                        .update({
                            monto_pendiente: newMontoPendiente,
                            estado: newEstado
                        })
                        .eq('id', matchingInvoice.id);

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
        return ref.toUpperCase()
            .replace(/^(TRF|TRANSF|TRANSFERENCIA|CHQ|CHEQUE|DEP|DEPOSITO|RECIBO|RE|OP|PAGO|COBRO)[:\s-]*/i, '')
            .replace(/[^A-Z0-0]/gi, '') // Solo alfanuméricos
            .trim();
    }
}
