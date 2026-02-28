import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TreasuryTab } from '@/components/dashboard/treasury-tab'
import { getOrgId } from '@/lib/supabase/utils'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

export default async function TreasuryPage({
    searchParams
}: {
    searchParams: { [key: string]: string | string[] | undefined }
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const orgId = await getOrgId(supabase, user.id)
    const { data: orgConfig } = await supabase.from('configuracion_empresa').select('colchon_liquidez').eq('organization_id', orgId).single()

    // Use timestamp + tab as key to force complete re-mount on sidebar click
    const timestamp = (searchParams?._t as string) || '0'
    const tab = (searchParams?.tab as string) || 'cashflow'
    const componentKey = `treasury-${tab}-${timestamp}`

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Finanzas</h2>
                <p className="text-gray-400">Gestión avanzada de cobros, pagos y simulaciones de caja.</p>
            </div>

            <Suspense fallback={
                <div className="flex items-center justify-center p-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
                </div>
            }>
                <TreasuryTab
                    key={componentKey}
                    orgId={orgId}
                    liquidityCushion={orgConfig?.colchon_liquidez || 0}
                />
            </Suspense>
        </div>
    )
}
