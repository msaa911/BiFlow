import { createClient } from '@/lib/supabase/server'

/**
 * RECONCILIATION ENGINE v1.0
 * Purpose: Automatically match bank transactions with pending treasury invoices (comprobantes).
 */
export class ReconciliationEngine {
    static async matchAndReconcile(organizationId: string) {
        console.log(`[RECONCILIATION] Starting auto-match for org: ${organizationId}`)

        const supabase = await createClient()

        // 1. Fetch pending invoices (AP/AR) — excluding NC/ND (they are handled by the payment wizard)
        const { data: pendingInvoices, error: invError } = await supabase
            .from('comprobantes')
            .select('*')
            .eq('organization_id', organizationId)
            .in('tipo', ['factura_venta', 'factura_compra'])
            .neq('estado', 'pagado')

        if (invError || !pendingInvoices || pendingInvoices.length === 0) {
            console.log(`[RECONCILIATION] No pending invoices found.`)
            return { matched: 0 }
        }

        // 2. Fetch pending bank transactions (not linked to a comprobante yet)
        const { data: pendingTrans, error: transError } = await supabase
            .from('transacciones')
            .select('*')
            .eq('organization_id', organizationId)
            .is('comprobante_id', null)

        if (transError || !pendingTrans || pendingTrans.length === 0) {
            console.log(`[RECONCILIATION] No unlinked transactions found.`)
            return { matched: 0 }
        }

        let matchedCount = 0
        const usedTransIds = new Set<string>()

        for (const invoice of pendingInvoices) {
            // Priority 1: Check Number Match (Last 4 digits + Amount matches pending)
            if (invoice.numero_cheque) {
                const invCheckLast4 = invoice.numero_cheque.slice(-4)
                const match = pendingTrans.find(t =>
                    !usedTransIds.has(t.id) &&
                    t.numero_cheque &&
                    t.numero_cheque.endsWith(invCheckLast4) &&
                    Math.abs(Number(t.monto)) === Math.abs(Number(invoice.monto_pendiente))
                )

                if (match) {
                    console.log(`[RECONCILIATION] [CHECK MATCH] Inv ${invoice.numero} with Trans ${match.id}`)
                    await this.executeReconciliation(supabase, invoice, match)
                    usedTransIds.add(match.id)
                    matchedCount++
                    continue
                }
            }

            // Priority 2: Smart CUIT + Amount Match (uses monto_pendiente)
            if (invoice.cuit_socio) {
                const match = pendingTrans.find(t =>
                    !usedTransIds.has(t.id) &&
                    t.cuit === invoice.cuit_socio &&
                    Math.abs(Number(t.monto)) === Math.abs(Number(invoice.monto_pendiente))
                )

                if (match) {
                    console.log(`[RECONCILIATION] [CUIT MATCH] Inv ${invoice.numero} with Trans ${match.id}`)
                    await this.executeReconciliation(supabase, invoice, match)
                    usedTransIds.add(match.id)
                    matchedCount++
                }
            }
        }

        console.log(`[RECONCILIATION] Finished. Matched: ${matchedCount}`)
        return { matched: matchedCount }
    }

    private static async executeReconciliation(supabase: any, invoice: any, transaction: any) {
        const transAmount = Math.abs(Number(transaction.monto))
        const pendingAmount = Number(invoice.monto_pendiente)

        // Calculate how much this transaction covers
        const amountApplied = Math.min(transAmount, pendingAmount)
        const newPending = Math.max(0, pendingAmount - amountApplied)
        const newEstado = newPending <= 0.01 ? 'pagado' : 'parcial'

        // 1. Update Transaction to point to Invoice
        const { error: tErr } = await supabase
            .from('transacciones')
            .update({
                comprobante_id: invoice.id,
                estado: 'conciliado'
            })
            .eq('id', transaction.id)

        if (tErr) throw new Error(`Reconciliation Error (Trans): ${tErr.message}`)

        // 2. Update Invoice with calculated pending amount and status
        const { error: iErr } = await supabase
            .from('comprobantes')
            .update({
                estado: newEstado,
                monto_pendiente: newPending
            })
            .eq('id', invoice.id)

        if (iErr) throw new Error(`Reconciliation Error (Inv): ${iErr.message}`)
    }
}
