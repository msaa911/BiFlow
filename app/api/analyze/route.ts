import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runAnalysis } from '@/lib/analysis/engine'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get Org ID (reuse logic or fetch)
        // For MVP, fetch first org member again
        let { data: member } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single()

        if (!member) {
            return NextResponse.json({ error: 'No organization found' }, { status: 404 })
        }

        const result = await runAnalysis(member.organization_id)

        return NextResponse.json({ success: true, ...result })

    } catch (error) {
        console.error('Analysis error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
