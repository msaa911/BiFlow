import { createClient } from '@/lib/supabase/server'
import { ReconciliationEngine } from '@/lib/reconciliation-engine'
import { getOrgId } from '@/lib/supabase/utils'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const orgId = await getOrgId(supabase, user.id)

        // Execute the engine (Nivel 1 & 2 are auto-reconciled on DB)
        // results contains Nivel 3 & 4 (Suggestions)
        const { matched, actions } = await ReconciliationEngine.matchAndReconcile(orgId)

        // Filter for suggestions only (Nivel 3: Fuzzy, Nivel 4: Proximity)
        const suggestions = actions.filter((a: any) => a.level >= 3)

        return NextResponse.json({
            count: matched,
            suggestions: suggestions
        })
    } catch (error: any) {
        console.error('Reconciliation API Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
