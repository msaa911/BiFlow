
import { createClient } from './lib/supabase/server'
import { getOrgId } from './lib/supabase/utils'
import { LiquidityEngine } from './lib/liquidity-engine'

async function debugDashboard() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        console.error('NO USER FOUND')
        return
    }

    const orgId = await getOrgId(supabase, user.id)
    console.log('DEBUG: Org ID:', orgId)

    const { data: orgConfig } = await supabase
        .from('configuracion_empresa')
        .select('*')
        .eq('organization_id', orgId)
        .single()

    console.log('DEBUG: Org Config:', orgConfig)

    const { data: allTransactions } = await supabase
        .from('transacciones')
        .select('monto')

    const totalBalance = allTransactions?.reduce((acc: number, curr: any) => acc + curr.monto, 0) || 0
    console.log('DEBUG: Total Balance:', totalBalance)

    const tna = orgConfig?.tna || 0.70
    const overdraftLimit = orgConfig?.limite_descubierto || 0

    const opportunityCost = LiquidityEngine.calculateOpportunityCost(totalBalance, 30, tna)
    const daysOfRunway = LiquidityEngine.calculateHealthScore(totalBalance, Math.abs(totalBalance / 2) || 1000, overdraftLimit)

    console.log('DEBUG: Opportunity Cost (Calculated):', opportunityCost)
    console.log('DEBUG: Days of Runway (Calculated):', daysOfRunway)
}

debugDashboard()
