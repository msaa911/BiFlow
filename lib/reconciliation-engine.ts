import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * RECONCILIATION ENGINE v2.0
 * Purpose: Smart matching of bank transactions with pending treasury invoices.
 * Strategy: Funnel (Reduction) + Subset Sum (1-a-N).
 */
export class ReconciliationEngine {
    static async matchAndReconcile(supabase: any, organizationId: string, options?: { dryRun?: boolean }) {
        const dryRun = options?.dryRun ?? false;
        console.log(`[RECONCILIATION v3.0] Starting auto-match for org: ${organizationId} (dryRun: ${dryRun})`)

        // 1. Fetch pending invoices (AP/AR) -> Order by due date to apply FIFO if multiple
        const { data: pendingInvoices, error: invError } = await supabase
            .from('comprobantes')
            .select('*')
            .eq('organization_id', organizationId)
            .in('tipo', ['factura_venta', 'factura_compra', 'nota_debito', 'nota_credito', 'ingreso_vario', 'egreso_vario'])
            .neq('estado', 'pagado')
            .order('fecha_vencimiento', { ascending: true })

        if (invError || !pendingInvoices || pendingInvoices.length === 0) {
            console.log(`[RECONCILIATION] No pending invoices found.`)
            return { matched: 0, actions: [] }
        }

        // 2. Fetch unlinked bank transactions
        const { data: pendingTrans, error: transError } = await supabase
            .from('transacciones')
            .select('*')
            .eq('organization_id', organizationId)
            .in('estado', ['pendiente', 'parcial'])

        if (transError || !pendingTrans || pendingTrans.length === 0) {
            console.log(`[RECONCILIATION] No unlinked transactions found.`)
            return { matched: 0, actions: [] }
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

            // Funnel
            if (txCuitNormalized) {
                targetInvoices = targetInvoices.filter(i => normalizeCuit(i.cuit_socio) === txCuitNormalized);
                matchLevel = 1;
            } else if (trans.metadata?.cbu && trustLedgerMap.has(trans.metadata.cbu)) {
                const deducedCuit = normalizeCuit(trustLedgerMap.get(trans.metadata.cbu));
                targetInvoices = targetInvoices.filter(i => normalizeCuit(i.cuit_socio) === deducedCuit);
                matchLevel = 2;
            } else {
                const fuzzyClientCuit = this.findClientByFuzzy(trans.descripcion || '', targetInvoices);
                if (fuzzyClientCuit) {
                    targetInvoices = targetInvoices.filter(i => normalizeCuit(i.cuit_socio) === normalizeCuit(fuzzyClientCuit));
                    matchLevel = 3;
                }
            }

            let finalMatch: any[] | null = null;
            if (targetInvoices.length > 0) {
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

            if (finalMatch && matchLevel <= 4) {
                console.log(`[RECONCILIATION] Match Level ${matchLevel} found for trans ${trans.id} (${availableTransAmount} avail., ${totalBankAmount} total)`);

                // In dryRun mode, just record the match without writing to DB
                if (dryRun) {
                    matchedCount++;
                    results.push({
                        transId: trans.id,
                        transDesc: trans.descripcion,
                        monto: availableTransAmount,
                        invoiceIds: finalMatch.map((i: any) => i.id),
                        level: matchLevel,
                        auto: true
                    });
                    continue;
                }

                try {
                    // --- CIRCUIT EXECUTION START ---
                    // 0. Get Entity ID (Mandatory for Movimiento)
                    const { data: entity, error: entityErr } = await supabase
                        .from('entidades')
                        .select('id')
                        .eq('organization_id', organizationId)
                        .eq('cuit', finalMatch[0].cuit_socio)
                        .single();

                    if (!entity || entityErr) {
                        console.error(`[RECON_ERROR] Entity not found for CUIT ${finalMatch[0].cuit_socio}:`, entityErr);
                        throw new Error(`Entity not found for CUIT ${finalMatch[0].cuit_socio}`);
                    }

                    // Calculate actual allocation
                    let remainingAvailableAmount = availableTransAmount;
                    let totalAppliedInOperation = 0;

                    const invoicesToApply = finalMatch.map(inv => {
                        const amountToApply = Math.min(Number(inv.monto_pendiente), remainingAvailableAmount);
                        remainingAvailableAmount -= amountToApply;
                        totalAppliedInOperation += amountToApply;
                        return { ...inv, amountToApply };
                    }).filter(i => i.amountToApply > 0);

                    if (totalAppliedInOperation <= 0) {
                        console.warn(`[RECONCILIATION] Computed 0 total applied for trans ${trans.id}`);
                        continue;
                    }

                    // 1. Create Movimiento Tesoreria (Header)
                    const { data: movimiento, error: movError } = await supabase
                        .from('movimientos_tesoreria')
                        .insert({
                            organization_id: organizationId,
                            entidad_id: entity.id,
                            tipo: isCobro ? 'cobro' : 'pago',
                            fecha: trans.fecha,
                            monto_total: totalAppliedInOperation,
                            observaciones: `AUTO: ${trans.descripcion}`,
                            metadata: { transaccion_id: trans.id, auto: true, level: matchLevel, partial: invoicesToApply.length > 1 }
                        })
                        .select()
                        .single();

                    if (movError) {
                        console.error(`[RECON_ERROR] Failed Movimiento Insert:`, movError);
                        throw movError;
                    }

                    // 2. Create Instrument (The bank movement)
                    const { error: insError } = await supabase
                        .from('instrumentos_pago')
                        .insert({
                            movimiento_id: movimiento.id,
                            metodo: 'transferencia',
                            monto: totalAppliedInOperation,
                            fecha_disponibilidad: trans.fecha,
                            banco: trans.banco,
                            referencia: trans.descripcion,
                            estado: 'acreditado'
                        });

                    if (insError) {
                        console.error(`[RECON_ERROR] Failed Instrument Insert:`, insError);
                        throw insError;
                    }

                    // 3. Create Applications & Update Invoices
                    for (const inv of invoicesToApply) {
                        const { error: appError } = await supabase
                            .from('aplicaciones_pago')
                            .insert({
                                movimiento_id: movimiento.id,
                                comprobante_id: inv.id,
                                monto_aplicado: inv.amountToApply
                            });

                        if (appError) {
                            console.error(`[RECON_ERROR] Failed Aplicacion Insert for Inv ${inv.id}:`, appError);
                            throw appError;
                        }

                        const newPendiente = Number(inv.monto_pendiente) - inv.amountToApply;
                        const newEstado = newPendiente <= 0.05 ? 'pagado' : 'parcial';

                        const { error: invErr } = await supabase
                            .from('comprobantes')
                            .update({
                                monto_pendiente: Math.max(0, newPendiente),
                                estado: newEstado,
                                metadata: {
                                    ...(inv.metadata || {}),
                                    last_auto_reconciled: new Date().toISOString(),
                                    transaccion_id: trans.id
                                }
                            })
                            .eq('id', inv.id)
                            .eq('organization_id', organizationId);

                        if (invErr) {
                            console.error(`[RECON_ERROR] Failed Invoice Update for Inv ${inv.id}:`, invErr);
                            throw invErr;
                        }

                        // Update local pendingInvoices to avoid double-dipping in the same run
                        const localInv = pendingInvoices.find((i: any) => i.id === inv.id);
                        if (localInv) {
                            localInv.monto_pendiente = Math.max(0, newPendiente);
                            localInv.estado = newEstado;
                        }
                    }

                    // 4. Update Bank Transaction
                    const newMontoUsado = previouslyUsed + totalAppliedInOperation;
                    const isFullyUsed = newMontoUsado >= totalBankAmount - 0.05;

                    const { error: txError } = await supabase
                        .from('transacciones')
                        .update({
                            movimiento_id: movimiento.id,
                            estado: isFullyUsed ? 'conciliado' : 'parcial',
                            monto_usado: newMontoUsado,
                            tags
                        })
                        .eq('id', trans.id)
                        .eq('organization_id', organizationId);

                    if (txError) {
                        console.error(`[RECON_ERROR] Failed Transaccion Update for Tx ${trans.id}:`, txError);
                        throw txError;
                    }

                    matchedCount++;
                    results.push({
                        transId: trans.id,
                        monto: availableTransAmount,
                        movimientoId: movimiento.id,
                        level: matchLevel,
                        auto: true
                    });

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
