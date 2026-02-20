import { createClient } from '@/lib/supabase/server'

/**
 * RECONCILIATION ENGINE v1.0
 * Purpose: Automatically match bank transactions with pending treasury invoices (comprobantes).
 */
export class ReconciliationEngine {
    static async matchAndReconcile(organizationId: string) {
        console.log(`[RECONCILIATION] Starting auto-match for org: ${organizationId}`)

        // We use the service role to ensure consistency across RLS if needed, 
        // but server-side createClient should be enough if called within authorized context.
        const supabase = await createClient()

        // 1. Fetch pending invoices (AP/AR)
        const { data: pendingInvoices, error: invError } = await supabase
            .from('comprobantes')
            .select('*')
            .eq('organization_id', organizationId)
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

        for (const invoice of pendingInvoices) {
            // Priority 1: Check Number Match (Last 4 digits + Amount)
            if (invoice.numero_cheque) {
                const invCheckLast4 = invoice.numero_cheque.slice(-4)
                const match = pendingTrans.find(t =>
                    t.numero_cheque &&
                    t.numero_cheque.endsWith(invCheckLast4) &&
                    Math.abs(Number(t.monto)) === Math.abs(Number(invoice.monto_total))
                )

                if (match) {
                    console.log(`[RECONCILIATION] [CHECK MATCH] Inv ${invoice.numero} with Trans ${match.id}`)
                    await this.executeReconciliation(supabase, invoice.id, match.id)
                    matchedCount++
                    continue // Skip to next invoice
                }
            }

            // Priority 2: Smart CUIT + Amount Match
            if (invoice.cuit_socio) {
                const match = pendingTrans.find(t =>
                    t.cuit === invoice.cuit_socio &&
                    Math.abs(Number(t.monto)) === Math.abs(Number(invoice.monto_total))
                )

                if (match) {
                    console.log(`[RECONCILIATION] [CUIT MATCH] Inv ${invoice.numero} with Trans ${match.id}`)
                    await this.executeReconciliation(supabase, invoice.id, match.id)
                    matchedCount++
                }
            }
        }

        console.log(`[RECONCILIATION] Finished. Matched: ${matchedCount}`)
        return { matched: matchedCount }
    }

    private static async executeReconciliation(supabase: any, invoiceId: string, transactionId: string) {
        // Atomic-like update (sequential for now, could be transaction-wrapped in RPC)

        // 1. Update Transaction to point to Invoice
        const { error: tErr } = await supabase
            .from('transacciones')
            .update({
                comprobante_id: invoiceId,
                estado: 'conciliado' // Optional: if we want a specific status for record
            })
            .eq('id', transactionId)

        if (tErr) throw new Error(`Reconciliation Error (Trans): ${tErr.message}`)

        // 2. Update Invoice to Pagado
        const { error: iErr } = await supabase
            .from('comprobantes')
            .update({
                estado: 'pagado',
                monto_pendiente: 0
            })
            .eq('id', invoiceId)

        if (iErr) throw new Error(`Reconciliation Error (Inv): ${iErr.message}`)
    }
}
