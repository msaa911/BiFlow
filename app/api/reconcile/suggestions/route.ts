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

        // Execute the engine in DRY RUN mode (read-only, no DB writes)
        // This allows us to show suggestions without consuming the matches
        const { matched, actions } = await ReconciliationEngine.matchAndReconcile(supabase, orgId, { dryRun: true })

        // Return ALL potential matches (Level 1-4) as suggestions for the UI
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
