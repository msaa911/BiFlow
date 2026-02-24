import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CashFlowAdvisor } from '@/lib/ai/cashflow-advisor'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message } = await request.json()

    // 1. Get Organization
    const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

    if (!member) return NextResponse.json({ error: 'No org' }, { status: 403 })
    const orgId = member.organization_id

    // 2. Manage Chat Session
    const { data: session } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('organization_id', orgId)
        .limit(1)
        .maybeSingle()

    let sessionId = session?.id
    if (!sessionId) {
        const { data: newSession } = await supabase
            .from('chat_sessions')
            .insert({ organization_id: orgId, user_id: user.id, title: 'Consulta General' })
            .select()
            .single()
        sessionId = newSession?.id
    }

    // 3. AI Advisor Execution
    const advisor = new CashFlowAdvisor();

    // Fetch previous messages for context
    const { data: historyData } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(10);

    const history = historyData?.map(m => ({
        role: m.role,
        content: m.content
    })) || [];

    const reply = await advisor.generateResponse(orgId, message, history);

    // 4. Persistence (Save to DB)
    if (sessionId) {
        await supabase.from('chat_messages').insert([
            { session_id: sessionId, role: 'user', content: message },
            { session_id: sessionId, role: 'assistant', content: reply }
        ])
    }

    return NextResponse.json({ reply })
}
