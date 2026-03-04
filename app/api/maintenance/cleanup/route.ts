import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const adminSupabase = createAdminClient()

        // 1. Get Org ID
        const { data: member } = await adminSupabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single()

        if (!member) return NextResponse.json({ error: 'Organization not found' }, { status: 403 })
        const orgId = member.organization_id

        // 2. Fetch all "auto" movements for this org
        const { data: allAutoMovs } = await adminSupabase
            .from('movimientos_tesoreria')
            .select('*, aplicaciones_pago(*), instrumentos_pago(*)')
            .eq('organization_id', orgId)
            .eq('metadata->>auto', 'true')

        if (!allAutoMovs || allAutoMovs.length === 0) {
            return NextResponse.json({ message: 'No auto-movements found to clean.' })
        }

        // 3. Fetch all transactions to see who is the "official" winner
        const { data: allTrans } = await adminSupabase
            .from('transacciones')
            .select('id, movimiento_id')
            .eq('organization_id', orgId)

        const txToWinnerMap = new Map()
        allTrans?.forEach(t => {
            if (t.movimiento_id) txToWinnerMap.set(t.id, t.movimiento_id)
        })

        // 4. Group movements by transaction_id
        const groups = new Map<string, any[]>()
        allAutoMovs.forEach(m => {
            const txId = (m.metadata as any)?.transaccion_id
            if (txId) {
                if (!groups.has(txId)) groups.set(txId, [])
                groups.get(txId)?.push(m)
            }
        })

        let deletedCount = 0
        const affectedInvoiceIds = new Set<string>()

        for (const [txId, movements] of groups.entries()) {
            if (movements.length <= 1) continue;

            const officialId = txToWinnerMap.get(txId)

            // Winners logic: pick the linked one or the first one created
            movements.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || 0)

            const officialInList = movements.find(m => m.id === officialId)
            const winner = officialInList || movements[0]
            const losers = movements.filter(m => m.id !== winner.id)

            for (const loser of losers) {
                // Collect affected invoices for later recalculation
                loser.aplicaciones_pago?.forEach((app: any) => affectedInvoiceIds.add(app.comprobante_id))

                // Delete loser dependencies and itself
                await adminSupabase.from('aplicaciones_pago').delete().eq('movimiento_id', loser.id)
                await adminSupabase.from('instrumentos_pago').delete().eq('movimiento_id', loser.id)
                await adminSupabase.from('movimientos_tesoreria').delete().eq('id', loser.id)
                deletedCount++
            }
        }

        // 5. Recalculate Invoice Balances
        let recalculatedCount = 0
        for (const invId of affectedInvoiceIds) {
            // Get invoice total amount
            const { data: inv } = await adminSupabase
                .from('comprobantes')
                .select('monto_total')
                .eq('id', invId)
                .single()

            if (!inv) continue

            // Get sum of all CURRENT applications (from non-deleted movements)
            const { data: apps } = await adminSupabase
                .from('aplicaciones_pago')
                .select('monto_aplicado')
                .eq('comprobante_id', invId)

            const totalPaid = apps?.reduce((acc, curr) => acc + Number(curr.monto_aplicado), 0) || 0
            const newPendiente = Math.max(0, Number(inv.monto_total) - totalPaid)
            const newEstado = newPendiente <= 0.05 ? 'pagado' : (totalPaid > 0 ? 'parcial' : 'pendiente')

            await adminSupabase
                .from('comprobantes')
                .update({
                    monto_pendiente: newPendiente,
                    estado: newEstado
                })
                .eq('id', invId)

            recalculatedCount++
        }

        return NextResponse.json({
            success: true,
            deletedMovements: deletedCount,
            recalculatedInvoices: recalculatedCount
        })

    } catch (error: any) {
        console.error('[CLEANUP_API] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
