
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/supabase/utils'
import { runAnalysis } from '@/lib/analysis/engine'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const orgId = await getOrgId(supabase, user.id)
        if (!orgId) {
            console.error('[API/ANALYSIS] Org no encontrada')
            return NextResponse.json({ error: 'Org no encontrada' }, { status: 404 })
        }

        console.log(`[API/ANALYSIS] Executing manual analysis for org: ${orgId}...`)
        const result = await runAnalysis(orgId)
        console.log('[API/ANALYSIS] Analysis completed:', result)

        return NextResponse.json({ success: true, result })
    } catch (error: any) {
        console.error('Error running manual analysis:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
