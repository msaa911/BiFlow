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
        const { data: pendingInvoices, error: invError } = await supabase
            .from('comprobantes')
            .select('*')
            .eq('organization_id', organizationId)
            .in('tipo', ['factura_venta', 'factura_compra', 'nota_debito', 'nota_credito', 'ingreso_vario', 'egreso_vario'])
            .neq('estado', 'pagado')
            .order('fecha_vencimiento', { ascending: true })

        // 2.b Fetch pending movements (Receipts/OPs)
        const { data: pendingMovements } = await supabase
            .from('instrumentos_pago')
            .select('*, movimientos_tesoreria(*, entidades(*), aplicaciones_pago(comprobante_id, comprobantes(nro_factura)))')
            .eq('organization_id', organizationId)
            .in('estado', ['pendiente', 'parcial'])
            .order('fecha_disponibilidad', { ascending: true });

        if (invError && !pendingMovements) {
            console.log(`[RECONCILIATION] No pending data found.`)
            return { matched: 0, actions: [], repaired: orphans?.length || 0 }
        }

        // 3. Fetch unlinked bank transactions
        const { data: pendingTrans, error: transError } = await supabase
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
            const { data: pastMatches } = await supabase
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

            let targetInvoices: any[] = pendingInvoices.filter((i: any) => targetTipos.includes(i.tipo));
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
                const fuzzyClientCuit = this.findClientByFuzzy(trans.descripcion || '', targetInvoices);
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
                    const mAmount = Number(m.monto);
                    const amountMatches = Math.abs(mAmount - availableTransAmount) < 0.05;

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

                    // 1. Verificamos si hay referencias cruzadas de factura en la descripcion del banco
                    let hasReferenceMatch = false;

                    // 1.a Check aplicaciones_pago for invoice numbers
                    if (mov?.aplicaciones_pago && Array.isArray(mov.aplicaciones_pago)) {
                        for (const app of mov.aplicaciones_pago) {
                            const compNum = app.comprobantes?.nro_factura; // ej: 'FAC-A-0001-1234'
                            if (compNum) {
                                // Extract the meaningful part of the invoice (last digits, ignoring zeros)
                                const parts = compNum.split('-');
                                const lastPart = parts[parts.length - 1]; // '1234'
                                if (lastPart && lastPart.length >= 3) {
                                    const regex = new RegExp(`\\b0*${Number(lastPart)}\\b`); // match 1234, 01234, 001234
                                    if (regex.test(descUpper) || descUpper.includes(lastPart)) {
                                        hasReferenceMatch = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    // 1.b Check observaciones del movimiento (fallback manual)
                    if (!hasReferenceMatch && mov?.observaciones) {
                        const obsMatch = mov.observaciones.match(/[A-Z]+-?\d{1,4}-?(\d{4,8})/); // Catch patterns like FAC-0001-1234
                        if (obsMatch && obsMatch[1]) {
                            const lastPart = obsMatch[1];
                            const numericVal = Number(lastPart);
                            const regex = new RegExp(`\\b0*${numericVal}\\b`);
                            if (numericVal > 0 && (regex.test(descUpper) || descUpper.includes(lastPart))) {
                                hasReferenceMatch = true;
                            }
                        }
                    }

                    // --- EVALUACIÓN FINAL DE COINCIDENCIA DE 1 A 1 ---

                    // Si el Banco + Recibo comparten la REFERENCIA DE PAGO (Nº Transf, Nº Cheque) Y el MONTO: Match Absoluto.
                    if (hasPaymentRefMatch) return true;

                    // Si el Banco menciona la FACTURA pagada Y el MONTO coincide: Match Absoluto (Permite CUITs de terceros).
                    if (hasReferenceMatch) return true;

                    // Fallback: Si no escribieron referencia clara ni comprobante, requerimos que el CUIT o Nombre coincida
                    if (txCuitNormalized && movEntidad?.cuit && normalizeCuit(movEntidad.cuit) === txCuitNormalized) {
                        return true;
                    }

                    const razonSocial = (movEntidad?.razon_social || '').toUpperCase();
                    if (razonSocial) {
                        const words = razonSocial.split(/\s+/).filter((w: string) => w.length > 3);
                        if (words.some((w: string) => descUpper.includes(w))) return true;
                    }

                    // Si solo coinciden los montos pero no hay referencias cruzadas, 
                    // ni cuit igual, ni la razón social en la descripción, es demasiado riesgoso asumirlo como Match 100% automático.
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

        console.log(`[RECONCILIATION] Finished. Matched: ${matchedCount}. Total Results: ${results.length}`);
        return { matched: matchedCount, actions: results };
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
}
