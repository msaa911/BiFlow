import { createClient } from '@/lib/supabase/server'
import { ReconciliationEngine } from '@/lib/reconciliation-engine'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get organization ID
    const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

    if (!member) {
        return NextResponse.json({ error: 'No organization found' }, { status: 403 })
    }

    try {
        const result = await ReconciliationEngine.matchAndReconcile(supabase, member.organization_id)
        return NextResponse.json(result)
    } catch (error: any) {
        console.error('[API_RECONCILE_AUTO] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
