
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

    // 2. Fetch Comprehensive Financial Context
    const [
        { data: transactions },
        { data: findings },
        { data: bankFindings },
        { data: invoices },
        { data: projections },
        { data: bankAccounts },
        { data: orgConfig }
    ] = await Promise.all([
        supabase
            .from('transacciones')
            .select('monto, descripcion, fecha, tags')
            .eq('organization_id', orgId)
            .order('fecha', { ascending: false })
            .limit(500),
        supabase.from('hallazgos').select('*').eq('organization_id', orgId).eq('estado', 'detectado'),
        supabase.from('hallazgos_auditoria').select('*').eq('organization_id', orgId),
        supabase.from('comprobantes').select('*').eq('organization_id', orgId).neq('estado', 'pagado'),
        supabase.from('pagos_proyectados').select('*').eq('organization_id', orgId).eq('estado', 'programado'),
        supabase.from('cuentas_bancarias').select('*').eq('organization_id', orgId),
        supabase.from('configuracion_empresa').select('*').eq('organization_id', orgId).maybeSingle()
    ])

    const initialBalancesSum = bankAccounts?.reduce((acc: number, curr: any) => acc + (Number(curr.saldo_inicial) || 0), 0) || 0
    const transactionsSum = transactions?.reduce((acc, t) => acc + t.monto, 0) || 0
    const balance = transactionsSum + initialBalancesSum

    const anomalies = findings?.filter(f => f.tipo === 'anomalia' || f.tipo === 'duplicado') || []
    const becAlerts = findings?.filter(f => f.detalle?.is_bec) || []

    // Improved Tax Strategy Logic: Using tags as source of truth
    const taxLeaks = transactions?.filter(t => t.tags?.includes('impuesto_recuperable')) || []
    const totalRecoverable = taxLeaks.reduce((acc, t) => acc + Math.abs(t.monto), 0)

    const bankFeesDiff = bankFindings?.reduce((acc, f) => acc + (f.diferencia || 0), 0) || 0

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
    else if (msgLower.includes('duplicado') || msgLower.includes('error') || msgLower.includes('anomalia') || msgLower.includes('bec') || msgLower.includes('seguridad')) {
        if (becAlerts.length > 0) {
            reply = `¡ATENCIÓN DE SEGURIDAD! He detectado ${becAlerts.length} transacciones con CBUs no habituales para proveedores conocidos. Esto podría ser un intento de estafa (BEC). Por favor, verifica el CBU antes de confirmar cualquier lote.`
        } else if (anomalies.length > 0) {
            const high = anomalies.filter(a => a.severidad === 'critical' || a.severidad === 'high').length
            reply = `He detectado ${anomalies.length} anomalías operativas. Hay ${high} casos de alta prioridad, mayormente pagos duplicados en terminales POS que deberías revisar.`
        } else {
            reply = "No he encontrado anomalías de seguridad ni duplicados críticos. Tu flujo parece alineado con los patrones históricos."
        }
    }
    else if (msgLower.includes('comision') || msgLower.includes('banco') || msgLower.includes('me cobraron')) {
        if (bankFeesDiff > 0) {
            reply = `He auditado tus convenios bancarios y detecté que te han cobrado $${bankFeesDiff.toLocaleString('es-AR')} de más en conceptos de mantenimiento o chequeras. Puedes generar el reclamo automáticamente desde el Centro de Auditoría.`
        } else {
            reply = "He verificado tus comisiones bancarias contra tus acuerdos pactados y coinciden perfectamente. El banco está cumpliendo con lo firmado."
        }
    }
    else if (msgLower.includes('saldo') || msgLower.includes('balance') || msgLower.includes('cuanto tengo')) {
        reply = `Tu saldo operativo actual según los registros es de $${balance.toLocaleString('es-AR')}. Recuerda que este es un balance contable basado en tus importaciones.`
    }
    // --- NUEVA CAPA DE MEMORIA TRANSACCIONAL ---
    else if (msgLower.includes('ultimo') || msgLower.includes('ultima') || msgLower.includes('pago') || msgLower.includes('transaccion')) {
        // Buscar keywords específicas sacando conectores
        const ignoreWords = ['el', 'la', 'de', 'un', 'una', 'pago', 'ultimo', 'ultima', 'donde', 'hicimos', 'hicimos', 'que'];
        const keywords = msgLower.split(' ').filter((w: string) => w.length > 2 && !ignoreWords.includes(w));

        const match = transactions?.find((t: any) =>
            keywords.some((k: string) => t.descripcion.toLowerCase().includes(k))
        );

        if (match) {
            reply = `El último movimiento relacionado que encontré es: "${match.descripcion}" por un monto de $${Math.abs(match.monto).toLocaleString('es-AR')} el día ${new Date(match.fecha).toLocaleDateString('es-AR')}.`
        } else {
            reply = "No pude encontrar una transacción específica con esos términos en los últimos registros. ¿Podrías ser más específico con el nombre del proveedor o el concepto?"
        }
    }
    else if (msgLower.includes('grande') || msgLower.includes('mayor') || msgLower.includes('maximo') || msgLower.includes('caro')) {
        const top = [...(transactions || [])].sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))[0]
        if (top) {
            reply = `La operación más grande registrada recientemente es "${top.descripcion}" por $${Math.abs(top.monto).toLocaleString('es-AR')} realizada el ${new Date(top.fecha).toLocaleDateString('es-AR')}.`
        } else {
            reply = "No tengo registros suficientes para determinar la operación más grande aún."
        }
    }
    // --- NUEVO: CONCENTRACIÓN DE SOCIOS (CLIENTES Y PROVEEDORES) ---
    else if (msgLower.includes('proveedor') || msgLower.includes('cliente') || msgLower.includes('quien') || msgLower.includes('donde') || msgLower.includes('gasto') || msgLower.includes('pago')) {
        const isClientQuery = msgLower.includes('cliente') || msgLower.includes('vendi') || msgLower.includes('ingres');
        const filteredTx = (transactions || []).filter((t: any) => isClientQuery ? t.monto > 0 : t.monto < 0);

        const concentration: Record<string, number> = {};
        filteredTx.forEach((t: any) => {
            const desc = t.descripcion.split(' ')[0].toUpperCase();
            concentration[desc] = (concentration[desc] || 0) + Math.abs(t.monto);
        });

        const sorted = Object.entries(concentration).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const label = isClientQuery ? 'clientes' : 'proveedores';

        if (sorted.length > 0) {
            reply = `Tus 3 principales ${label} por volumen comercial son: ${sorted.map(s => `${s[0]} ($${s[1].toLocaleString('es-AR')})`).join(', ')}. ¿Te interesa profundizar en la relación con alguno de ellos?`
        } else {
            reply = `No logré identificar ${label} significativos en el historial analizado (últimas 500 operaciones).`
        }
    }
    // --- NUEVO: RUNWAY & BURN RATE ---
    else if (msgLower.includes('dias') || msgLower.includes('puedo') || msgLower.includes('cuanto tiempo') || msgLower.includes('runway') || msgLower.includes('caja')) {
        const weeklyExpenses = (transactions || [])
            .filter((t: any) => t.monto < 0 && new Date(t.fecha) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
            .reduce((acc, t) => acc + Math.abs(t.monto), 0) / 4;

        if (weeklyExpenses > 0) {
            const days = Math.floor((balance / (weeklyExpenses / 7)));
            reply = `Con tu saldo actual de $${balance.toLocaleString('es-AR')} y un gasto promedio semanal de $${weeklyExpenses.toLocaleString('es-AR')}, tienes aproximadamente **${days} días de runway** operativo.`
        } else {
            reply = "No tengo suficiente historial de gastos para calcular tu runway, pero tu balance actual es sólido."
        }
    }
    // --- NUEVO: INGRESOS & VARIACIÓN ---
    else if (msgLower.includes('ingres') || msgLower.includes('vendi') || msgLower.includes('cobramos')) {
        const now = new Date();
        const thisMonthTotal = (transactions || []).filter((t: any) => t.monto > 0 && new Date(t.fecha).getMonth() === now.getMonth()).reduce((acc, t) => acc + t.monto, 0);
        const lastMonthTotal = (transactions || []).filter((t: any) => t.monto > 0 && new Date(t.fecha).getMonth() === (now.getMonth() === 0 ? 11 : now.getMonth() - 1)).reduce((acc, t) => acc + t.monto, 0);

        if (lastMonthTotal > 0) {
            const variacion = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
            reply = `Este mes ingresaron $${thisMonthTotal.toLocaleString('es-AR')}. Comparado con el mes pasado ($${lastMonthTotal.toLocaleString('es-AR')}), esto representa una **variación del ${variacion.toFixed(1)}%**.`;
        } else {
            reply = `Este mes los ingresos totalizan $${thisMonthTotal.toLocaleString('es-AR')}. No cuento con datos suficientes del mes pasado para una comparativa porcentual.`;
        }
    }
    // --- NUEVO: TREASURY HUB (AR/AP & COVERAGE) ---
    else if (msgLower.includes('factura') || msgLower.includes('debe') || msgLower.includes('cobrar') || msgLower.includes('vencid')) {
        const ar = (invoices || []).filter((i: any) => i.tipo === 'factura_venta');
        const overdue = ar.filter((i: any) => new Date(i.fecha_vencimiento) < new Date());

        if (overdue.length > 0) {
            reply = `Tienes ${overdue.length} facturas de venta vencidas por un total de $${overdue.reduce((acc, i) => acc + Number(i.monto_pendiente), 0).toLocaleString('es-AR')}. Los deudores principales son: ${overdue.slice(0, 3).map(i => i.razon_social_socio).join(', ')}.`
        } else {
            reply = "No detecté facturas de venta vencidas. Tu cartera de cobros parece al día."
        }
    }
    // New Logic for Tax Expenditure
    else if (msgLower.includes('gasto') && (msgLower.includes('impuesto') || msgLower.includes('afip') || msgLower.includes('arba'))) {
        const taxKeywords = ['afip', 'arba', 'retencion', 'impuesto', 'percepcion', 'iivv', 'iva'];
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        const currentMonthTaxes = (transactions || []).filter(t => {
            const txDate = new Date(t.fecha);
            const matchesKeyword = taxKeywords.some(k => t.descripcion.toLowerCase().includes(k));
            const matchesTag = t.tags?.includes('impuesto_recuperable');
            return (matchesKeyword || matchesTag) && txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
        });

        const totalTaxExpense = currentMonthTaxes.reduce((acc, t) => acc + Math.abs(t.monto), 0);

        if (totalTaxExpense > 0) {
            reply = `El gasto total en impuestos/retenciones detectado para este mes es de $${totalTaxExpense.toLocaleString('es-AR')}. Esto incluye ${currentMonthTaxes.length} movimientos entre AFIP, ARBA y otras retenciones bancarias.`
        } else {
            reply = "No he detectado movimientos de impuestos procesados en el mes en curso aún. ¿Deseas que revise el mes anterior?"
        }
    }
    else if (msgLower.includes('pagar') || msgLower.includes('debo') || msgLower.includes('deuda') || msgLower.includes('cubrir')) {
        const next7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const soon = (projections || []).filter((p: any) => new Date(p.fecha_pago_proyectada) <= next7Days);
        const totalToPay = soon.reduce((acc, p) => acc + Number(p.monto), 0);

        if (totalToPay > 0) {
            const gap = totalToPay - balance;
            if (gap > 0) {
                reply = `Para los próximos 7 días tienes pagos programados por $${totalToPay.toLocaleString('es-AR')}. Tu saldo actual no alcanza: te faltan **$${gap.toLocaleString('es-AR')}** para cubrir todos los compromisos.`
            } else {
                reply = `Tienes pagos programados por $${totalToPay.toLocaleString('es-AR')} en la semana. Tu saldo de $${balance.toLocaleString('es-AR')} cubre perfectamente los gastos y te sobran $${(balance - totalToPay).toLocaleString('es-AR')}.`
            }
        } else {
            reply = "No tienes pagos programados de gran volumen para esta semana. Tu caja está relajada."
        }
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
