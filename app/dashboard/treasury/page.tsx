import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TreasuryTab } from '@/components/dashboard/treasury-tab'
import { getOrgId } from '@/lib/supabase/utils'

export const dynamic = 'force-dynamic'

export default async function TreasuryPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const orgId = await getOrgId(supabase, user.id)
    const { data: orgConfig } = await supabase.from('configuracion_empresa').select('colchon_liquidez').eq('organization_id', orgId).single()

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Tesorería Inteligente</h2>
                <p className="text-gray-400">Gestión avanzada de cobros, pagos y simulaciones de caja.</p>
            </div>

            <TreasuryTab orgId={orgId} liquidityCushion={orgConfig?.colchon_liquidez || 0} />
        </div>
    )
}
