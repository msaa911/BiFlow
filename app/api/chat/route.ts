import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CashFlowAdvisor } from '@/lib/ai/cashflow-advisor'

export const dynamic = 'force-dynamic'

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

    // Fetch Context Summary for God Mode
    const { data: trans } = await supabase.from('transacciones').select('monto, tags, fecha').eq('organization_id', orgId);
    let totalBalance = 0;
    let anomalyCount = 0;
    if (trans) {
        totalBalance = trans.reduce((acc: any, t: any) => acc + t.monto, 0);
        anomalyCount = trans.filter((t: any) => t.tags && (t.tags.includes('alerta_precio') || t.tags.includes('posible_duplicado') || t.tags.includes('riesgo_bec'))).length;
    }

    const { count: pendingTaxesCount } = await supabase.from('tax_intelligence_rules').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('estado', 'PENDIENTE');

    const contextSummary = `
SALDO OPERATIVO ACTUAL: $${totalBalance.toFixed(2)}
ANOMALÍAS ACTIVAS DETECTADAS: ${anomalyCount} (Reales alertas configuradas en transacciones!)
REGLAS FISCALES PENDIENTES DE REVISIÓN: ${pendingTaxesCount || 0}`;

    const reply = await advisor.generateResponse(orgId, message, history, contextSummary.trim());

    // 4. Persistence (Save to DB)
    if (sessionId) {
        await supabase.from('chat_messages').insert([
            { session_id: sessionId, role: 'user', content: message },
            { session_id: sessionId, role: 'assistant', content: reply }
        ])
    }

    return NextResponse.json({ reply })
}
