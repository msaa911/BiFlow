import { createClient } from '@/lib/supabase/server'

/**
 * RECONCILIATION ENGINE v2.0
 * Purpose: Smart matching of bank transactions with pending treasury invoices.
 * Strategy: Funnel (Reduction) + Subset Sum (1-a-N).
 */
export class ReconciliationEngine {
    static async matchAndReconcile(organizationId: string) {
        console.log(`[RECONCILIATION v2.0] Starting auto-match for org: ${organizationId}`)

        const supabase = await createClient()

        // 1. Fetch pending invoices (AP/AR)
        const { data: pendingInvoices, error: invError } = await supabase
            .from('comprobantes')
            .select('*')
            .eq('organization_id', organizationId)
            .in('tipo', ['factura_venta', 'factura_compra'])
            .neq('estado', 'pagado')

        if (invError || !pendingInvoices || pendingInvoices.length === 0) {
            console.log(`[RECONCILIATION] No pending invoices found.`)
            return { matched: 0, actions: [] }
        }

        // 2. Fetch unlinked bank transactions
        const { data: pendingTrans, error: transError } = await supabase
            .from('transacciones')
            .select('*')
            .eq('organization_id', organizationId)
            .is('comprobante_id', null)

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
        const usedTransIds = new Set<string>()
        const usedInvIds = new Set<string>()
        const results: any[] = []

        // Collector for bulk updates
        const transUpdates: any[] = []
        const invUpdates: any[] = []

        for (const trans of pendingTrans) {
            if (usedTransIds.has(trans.id)) continue;

            const transAmount = Math.abs(Number(trans.monto));
            let targetInvoices: any[] = [];
            let matchLevel = 0;

            // Anomalies
            let tags: string[] = trans.tags || [];
            let anomalyFound = false;

            if (transAmount > 5000000 && !tags.includes('alerta_precio')) {
                tags.push('alerta_precio');
                anomalyFound = true;
            }

            const mentionCBU = trans.descripcion?.match(/CBU\s*(\d{22})/i);
            if (mentionCBU && mentionCBU[1] && !trustLedgerMap.has(mentionCBU[1]) && !tags.includes('riesgo_bec')) {
                tags.push('riesgo_bec');
                anomalyFound = true;
            }

            // Funnel
            if (trans.cuit) {
                targetInvoices = pendingInvoices.filter(i => i.cuit_socio === trans.cuit && !usedInvIds.has(i.id));
                matchLevel = 1;
            } else if (trans.metadata?.cbu && trustLedgerMap.has(trans.metadata.cbu)) {
                const deducedCuit = trustLedgerMap.get(trans.metadata.cbu);
                targetInvoices = pendingInvoices.filter(i => i.cuit_socio === deducedCuit && !usedInvIds.has(i.id));
                matchLevel = 2;
            } else {
                const fuzzyClientCuit = this.findClientByFuzzy(trans.descripcion || '', pendingInvoices.filter(i => !usedInvIds.has(i.id)));
                if (fuzzyClientCuit) {
                    targetInvoices = pendingInvoices.filter(i => i.cuit_socio === fuzzyClientCuit && !usedInvIds.has(i.id));
                    matchLevel = 3;
                }
            }

            let finalMatch: any[] | null = null;
            if (targetInvoices.length > 0) {
                // 1-a-1
                const singleMatch = targetInvoices.find(i => Math.abs(Number(i.monto_pendiente) - transAmount) < 0.05);
                if (singleMatch) {
                    finalMatch = [singleMatch];
                }
                // 1-a-N
                else if (targetInvoices.length <= 20) {
                    finalMatch = this.findSubsetSum(targetInvoices, transAmount);
                }
            }

            if (finalMatch && matchLevel <= 2) {
                // AUTO-RECONCILE COLLECT
                matchedCount++;
                usedTransIds.add(trans.id);
                finalMatch.forEach(m => usedInvIds.add(m.id));

                transUpdates.push({
                    id: trans.id,
                    comprobante_id: finalMatch[0].id,
                    estado: 'conciliado',
                    tags,
                    metadata: {
                        ...trans.metadata,
                        reconciled_v2: true,
                        reconciled_at: new Date().toISOString(),
                        invoice_ids: finalMatch.map(i => i.id)
                    }
                });

                finalMatch.forEach(inv => {
                    invUpdates.push({
                        id: inv.id,
                        estado: 'pagado',
                        monto_pendiente: 0,
                        metadata: {
                            ...(inv.metadata || {}),
                            reconciled_v2: true,
                            reconciled_at: new Date().toISOString(),
                            transaccion_id: trans.id,
                            banco_transaccion: trans.banco,
                            desc_transaccion: trans.descripcion
                        }
                    });
                });

                results.push({
                    transId: trans.id,
                    transDesc: trans.descripcion,
                    monto: transAmount,
                    invoiceIds: finalMatch.map(i => i.id),
                    level: matchLevel,
                    auto: true
                });
            } else {
                // No auto-match, but maybe anomaly or level 3/4
                if (anomalyFound) {
                    transUpdates.push({ id: trans.id, tags });
                }

                if (finalMatch) {
                    // Level 3 Suggestion
                    results.push({
                        transId: trans.id,
                        transDesc: trans.descripcion,
                        monto: transAmount,
                        invoiceIds: finalMatch.map(i => i.id),
                        level: matchLevel,
                        auto: false
                    });
                } else {
                    // Level 4 Suggestion
                    const timeMatch = this.findMatchByProximity(trans, pendingInvoices.filter(i => !usedInvIds.has(i.id)));
                    if (timeMatch) {
                        results.push({
                            transId: trans.id,
                            transDesc: trans.descripcion,
                            monto: transAmount,
                            invoiceIds: [timeMatch.id],
                            level: 4,
                            auto: false
                        });
                    }
                }
            }
        }

        // EXECUTE BATCH UPDATES
        if (transUpdates.length > 0) {
            console.log(`[RECONCILIATION] Batch updating ${transUpdates.length} transactions...`)
            const { error: tErr } = await supabase.from('transacciones').upsert(transUpdates);
            if (tErr) console.error('[RECONCILIATION] Bulk Trans Error:', tErr);
        }

        if (invUpdates.length > 0) {
            console.log(`[RECONCILIATION] Batch updating ${invUpdates.length} invoices...`)
            const { error: iErr } = await supabase.from('comprobantes').upsert(invUpdates);
            if (iErr) console.error('[RECONCILIATION] Bulk Inv Error:', iErr);
        }

        console.log(`[RECONCILIATION] Finished. Matched: ${matchedCount}. Results: ${results.length}`);
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
        const transAmount = Math.abs(Number(trans.monto));

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
