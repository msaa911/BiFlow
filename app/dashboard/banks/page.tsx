import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getOrgId } from '@/lib/supabase/utils'
import { BanksTab } from '@/components/dashboard/banks-tab'

export const dynamic = 'force-dynamic'

import { BanksClientPage } from '@/components/dashboard/banks-client-page'

export default async function BanksPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const orgId = await getOrgId(supabase, user.id)

    // Initial fetch for SSR hydration
    const { data: transactions } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .order('fecha', { ascending: false })

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Bancos</h2>
                <p className="text-gray-400">Estado consolidado de cuentas, movimientos y conciliaciones pendientes.</p>
            </div>

            <BanksClientPage
                orgId={orgId}
                initialTransactions={transactions || []}
            />
        </div>
    )
}
