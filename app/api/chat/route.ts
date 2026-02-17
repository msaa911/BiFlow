
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message } = await request.json()
    const msgLower = message.toLowerCase()

    // 1. Get Organization
    const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

    if (!member) return NextResponse.json({ error: 'No org' }, { status: 403 })
    const orgId = member.organization_id

    // 2. Fetch Financial Context
    const { data: transactions } = await supabase.from('transacciones').select('monto').eq('organization_id', orgId)
    const { data: findings } = await supabase.from('hallazgos').select('*').eq('organization_id', orgId).eq('estado', 'detectado')

    const balance = transactions?.reduce((acc, t) => acc + t.monto, 0) || 0
    const anomalies = findings?.filter(f => f.tipo === 'anomalia' || f.tipo === 'duplicado') || []
    const taxLeaks = findings?.filter(f => f.tipo === 'fuga_fiscal') || []
    const totalRecoverable = taxLeaks.reduce((acc, f) => acc + (f.monto_estimado_recupero || 0), 0)

    // 3. Heuristic Response Logic ("Pseudo-AI")
    let reply = ""

    if (msgLower.includes('hola') || msgLower.includes('quien eres')) {
        reply = "Hola! Soy tu Advisor Financiero BiFlow. He analizado tus números y tengo algunas sugerencias interesantes. ¿Quieres saber sobre potenciales ahorros de impuestos o revisar anomalías?"
    }
    else if (msgLower.includes('impuesto') || msgLower.includes('recuperar') || msgLower.includes('afip')) {
        if (totalRecoverable > 0) {
            reply = `He detectado que puedes recuperar aproximadamente $${totalRecoverable.toLocaleString('es-AR')} en conceptos impositivos (AFIP/ARBA) que han sido retenidos. Te recomiendo descargar el reporte premium para ver el detalle por operación.`
        } else {
            reply = "Por ahora no he detectado impuestos recuperables significativos en tus últimas importaciones. ¡Buen trabajo manteniendo la eficiencia fiscal!"
        }
    }
    else if (msgLower.includes('duplicado') || msgLower.includes('error') || msgLower.includes('anomalia')) {
        if (anomalies.length > 0) {
            const high = anomalies.filter(a => a.severidad === 'critical' || a.severidad === 'high').length
            reply = `Cuidado: detecté ${anomalies.length} anomalías en total, de las cuales ${high} son de alta prioridad. Hay algunos pagos duplicados en terminales POS que deberías verificar con tus proveedores.`
        } else {
            reply = "No he encontrado duplicados ni anomalías críticas en tus movimientos recientes. Todo parece estar en orden."
        }
    }
    else if (msgLower.includes('saldo') || msgLower.includes('balance') || msgLower.includes('cuanto tengo')) {
        reply = `Tu saldo operativo actual según los registros es de $${balance.toLocaleString('es-AR')}. Recuerda que este es un balance contable basado en tus importaciones.`
    }
    else if (msgLower.includes('ahorro') || msgLower.includes('consejo')) {
        if (taxLeaks.length > 0) {
            reply = "Mi consejo principal hoy: gestiona el recupero de las percepciones detectadas. Representan una fuga de capital que podrías reinvertir en la operación."
        } else {
            reply = "Tu eficiencia financiera es alta. Mi recomendación es optimizar los saldos ociosos si tu flujo de caja proyectado lo permite."
        }
    }
    else {
        reply = "Entiendo. Estoy procesando esa información. Por ahora puedo darte detalles sobre tus impuestos recuperables ($" + totalRecoverable.toLocaleString('es-AR') + "), anomalías detectadas o tu balance general. ¿Qué prefieres ver?"
    }

    // 4. Persistence (Save to DB)
    // Create session if not exists (for demo we use a default one or handle it simple)
    // Actually, following the schema:
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

    if (sessionId) {
        await supabase.from('chat_messages').insert([
            { session_id: sessionId, role: 'user', content: message },
            { session_id: sessionId, role: 'assistant', content: reply }
        ])
    }

    return NextResponse.json({ reply })
}
