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

        // 3. Fetch Trust Ledger (CBU -> CUIT mapping) via RPC
        let trustLedgerMap = new Map<string, string>();
        try {
            const { data: pastMatches } = await supabase
                .rpc('get_trust_ledger', { org_id: organizationId });

            if (pastMatches) {
                pastMatches.forEach((m: any) => trustLedgerMap.set(m.cbu, m.cuit));
            }
        } catch (e) {
            console.warn('[RECONCILIATION] Trust Ledger RPC failed or not present. Fallback to CUIT only.');
        }

        let matchedCount = 0
        const usedTransIds = new Set<string>()
        const usedInvIds = new Set<string>()
        const results: any[] = []

        for (const trans of pendingTrans) {
            if (usedTransIds.has(trans.id)) continue;

            const transAmount = Math.abs(Number(trans.monto));
            let targetInvoices: any[] = [];
            let matchLevel = 0; // 1-2: Auto, 3-4: Suggested

            // ==========================================
            // 🌪️ EL EMBUDO DE FILTRADO (Filtro por Entidad)
            // ==========================================

            // Nivel 1: Match por CUIT directo
            if (trans.cuit) {
                targetInvoices = pendingInvoices.filter(i => i.cuit_socio === trans.cuit && !usedInvIds.has(i.id));
                matchLevel = 1;
            }
            // Nivel 2: Match por CBU (Trust Ledger)
            else if (trans.metadata?.cbu && trustLedgerMap.has(trans.metadata.cbu)) {
                const deducedCuit = trustLedgerMap.get(trans.metadata.cbu);
                targetInvoices = pendingInvoices.filter(i => i.cuit_socio === deducedCuit && !usedInvIds.has(i.id));
                matchLevel = 2;
            }
            // Nivel 3: Fuzzy Matching por Razón Social (Solo si no hay CUIT/CBU)
            else {
                const fuzzyClientCuit = this.findClientByFuzzy(trans.descripcion || '', pendingInvoices.filter(i => !usedInvIds.has(i.id)));
                if (fuzzyClientCuit) {
                    targetInvoices = pendingInvoices.filter(i => i.cuit_socio === fuzzyClientCuit && !usedInvIds.has(i.id));
                    matchLevel = 3;
                }
            }

            // ==========================================
            // 🧮 ESTRATEGIA DE MATCHING (1-a-1 vs 1-a-N)
            // ==========================================
            if (targetInvoices.length > 0) {
                // A. Intento 1-a-1 Exacto
                const singleMatch = targetInvoices.find(i => Math.abs(Number(i.monto_pendiente) - transAmount) < 0.05);

                if (singleMatch) {
                    if (matchLevel <= 2) {
                        await this.executeReconciliation(supabase, [singleMatch], trans);
                        matchedCount++;
                    }
                    results.push({
                        transId: trans.id,
                        transDesc: trans.descripcion,
                        monto: transAmount,
                        invoiceIds: [singleMatch.id],
                        level: matchLevel,
                        auto: matchLevel <= 2
                    });
                    usedTransIds.add(trans.id);
                    usedInvIds.add(singleMatch.id);
                    continue;
                }

                // B. Intento 1-a-N Exacto (Subset Sum)
                // Limitamos a 20 facturas por cliente para evitar explosión combinatoria
                if (targetInvoices.length <= 20) {
                    const combination = this.findSubsetSum(targetInvoices, transAmount);
                    if (combination && combination.length > 0) {
                        if (matchLevel <= 2) {
                            await this.executeReconciliation(supabase, combination, trans);
                            matchedCount++;
                        }
                        results.push({
                            transId: trans.id,
                            transDesc: trans.descripcion,
                            monto: transAmount,
                            invoiceIds: combination.map(c => c.id),
                            level: matchLevel,
                            auto: matchLevel <= 2
                        });
                        usedTransIds.add(trans.id);
                        combination.forEach(c => usedInvIds.add(c.id));
                        continue;
                    }
                }
            }

            // Nivel 4: Proximidad Temporal (Ventana 3 días + Monto exacto en toda la org)
            if (matchLevel === 0) {
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
                    // No ejecutamos automático en nivel 4
                }
            }
        }

        console.log(`[RECONCILIATION] Finished. Total Matched (Auto): ${matchedCount}. Potential suggestions: ${results.length - matchedCount}`);
        return { matched: matchedCount, actions: results };
    }

    private static findClientByFuzzy(desc: string, invoices: any[]): string | null {
        const normalizedDesc = desc.toLowerCase();
        // Simple keyword match: check if the first word of any provider is in the transaction description
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
            // Window of 3 days
            return diffDays <= 3 && Math.abs(Number(inv.monto_pendiente) - transAmount) < 0.05;
        });
    }

    private static findSubsetSum(invoices: any[], target: number): any[] | null {
        const tolerance = 0.05;
        const n = invoices.length;

        // Recursion with memoization or just backtracking for small n
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

    private static async executeReconciliation(supabase: any, invoices: any[], transaction: any) {
        // Standard reconciliation writes

        // 1. Update Transaction
        const { error: tErr } = await supabase
            .from('transacciones')
            .update({
                comprobante_id: invoices[0].id, // Primary link
                estado: 'conciliado',
                metadata: {
                    ...transaction.metadata,
                    reconciled_v2: true,
                    reconciled_at: new Date().toISOString(),
                    invoice_ids: invoices.map(i => i.id)
                }
            })
            .eq('id', transaction.id)

        if (tErr) throw tErr;

        // 2. Update Invoices
        for (const inv of invoices) {
            const { error: iErr } = await supabase
                .from('comprobantes')
                .update({
                    estado: 'pagado',
                    monto_pendiente: 0 // Assume exact for subset sum
                })
                .eq('id', inv.id);

            if (iErr) console.error(`[RECONCILIATION] Error updating inv ${inv.id}:`, iErr);
        }
    }
}
