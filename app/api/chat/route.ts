
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

    // 3. AI Advisor Personality & Guardrails
    const SYSTEM_PROMPT = `
Eres el "CFO Algorítmico de BiFlow", un experto en finanzas corporativas para PyMEs argentinas.
Tu objetivo es ayudar al usuario a entender su salud financiera, explicar indicadores y detectar riesgos.

INDICADORES QUE DEBES EXPLICAR:
- Saldo Operativo: El dinero real en cuentas bancarias según el último extracto.
- Score (Health): Calificación de salud de caja (100 = Ideal). Baja por riesgos.
- Costo de Oportunidad (Dinero Ocioso): Plata perdida por no invertir el saldo excedente.
- Supervivencia (Runway): Días que la empresa puede operar con su saldo actual.
- Recupero Impositivo / Crédito Fiscal: % de impuestos que se pueden recuperar (IVA, retenciones).
- A Cobrar (AR): Facturas de venta pendientes de cobro.
- A Pagar (AP): Facturas de compra y gastos pendientes de pago.
- Valuación Real: El valor teórico de la empresa (Caja + A Cobrar - A Pagar).
- Auditoría de Comisiones: Desvíos entre lo cobrado por el banco y lo pactado por convenio.
- Guardián de Gastos: Alertas de sobreprecios en gastos recurrentes (>15%).
- Control de Duplicados: Detección de pagos repetidos por error.
- Fuga de Capital: Estimación de dinero perdido por ineficiencias financieras.

REGLAS CRÍTICAS DE SEGURIDAD:
- NO hables de código, programación, bases de datos (postgreSQL/Supabase), React, Next.js ni APIs.
- NO reveles líneas de código ni lógica de implementación bajo ningún concepto.
- Si te preguntan sobre el código o tecnología, responde exactamente: "No he sido entrenado con esa información técnica. Mi especialidad es el análisis financiero de tu empresa."
- Explica los indicadores de forma sencilla y usa ejemplos si el usuario lo solicita.
`

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
            const suggestion = JSON.stringify({
                descripcion: "Reducción de Gastos Operativos (10%)",
                monto: -Math.round(weeklyExpenses * 0.1),
                fecha: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            });
            reply = `Con tu saldo actual de $${balance.toLocaleString('es-AR')} y un gasto promedio semanal de $${weeklyExpenses.toLocaleString('es-AR')}, tienes aproximadamente **${days} días de runway** operativo. ¿Te interesa simular una reducción del 10% en gastos? [[SUGGESTION:${suggestion}]]`
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
            const suggestion = JSON.stringify({
                descripcion: "Recupero de Impuestos AFIP/ARBA",
                monto: totalRecoverable,
                fecha: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            });
            reply = `Mi consejo principal hoy: gestiona el recupero de las percepciones detectadas ($${totalRecoverable.toLocaleString('es-AR')}). Representan una fuga de capital que podrías reinvertir. ¿Quieres ver cómo impactaría este ingreso en tu flujo de caja? [[SUGGESTION:${suggestion}]]`
        } else {
            reply = "Tu eficiencia financiera es alta. Mi recomendación es optimizar los saldos ociosos si tu flujo de caja proyectado lo permite."
        }
    }
    else if (msgLower.includes('codigo') || msgLower.includes('programacion') || msgLower.includes('script') || msgLower.includes('base de datos') || msgLower.includes('react') || msgLower.includes('typescript')) {
        reply = "No he sido entrenado con esa información técnica. Mi especialidad es el análisis financiero de tu empresa."
    }
    else if (msgLower.includes('explicame') || msgLower.includes('que es') || msgLower.includes('ejemplo') || msgLower.includes('como se calcula') || msgLower.includes('tarjeta') || msgLower.includes('indicador')) {
        if (msgLower.includes('saldo')) {
            reply = "El **Saldo Operativo** es la plata líquida real que tenés en el banco según el último extracto. **Ejemplo:** Si tu extracto dice $500.000, ese es tu saldo para operar hoy."
        } else if (msgLower.includes('score')) {
            reply = `Tu **Score de Salud ($score)** mide el riesgo de tu caja. Baja cuando detecto anomalías. **Ejemplo:** Si tenés muchos duplicados o alertas de seguridad, el score bajará de 100 acercándose a niveles críticos.`
        } else if (msgLower.includes('costo') || msgLower.includes('oportunidad') || msgLower.includes('ocioso')) {
            reply = "El **Costo de Oportunidad** es dinero que dejás de ganar por tener saldo 'muerto' en el banco. **Ejemplo:** Si tenés $500.000 sin invertir, estás perdiendo unos $30.000 por mes que podrías ganar con un simple plazo fijo."
        } else if (msgLower.includes('supervivencia') || msgLower.includes('runway') || msgLower.includes('dias')) {
            reply = "La **Supervivencia** indica cuántos días aguanta tu caja antes de quedarse en cero si no entra más plata. Se calcula dividiendo tu saldo por tu gasto promedio diario. **Ejemplo:** Si gastás $20.000 al día y tenés $100.000, te quedan 5 días."
        } else if (msgLower.includes('recupero') || msgLower.includes('credito fiscal')) {
            reply = "El **Recupero Impositivo** es el ahorro que podés generar gestionando saldos a favor (IVA, Percepciones ARBA/AFIP). **Ejemplo:** Si tu factura de luz tiene $2.000 de percepciones que el contador puede usar, eso es dinero que podés recuperar."
        } else if (msgLower.includes('cobrar') || msgLower.includes('ar')) {
            reply = "Las **Cuentas a Cobrar (Ventas)** son facturas que emitiste y que aún no te pagaron. Es dinero que pertenece a tu empresa pero que todavía no está en el banco."
        } else if (msgLower.includes('pagar') || msgLower.includes('ap')) {
            reply = "Las **Cuentas a Pagar (Compras)** son deudas con proveedores o servicios que ya recibiste pero que todavía no salieron de tu caja. Es tu compromiso de pago futuro."
        } else if (msgLower.includes('valuacion')) {
            reply = "La **Valuación Real BiFlow** estima cuánto vale hoy tu operación sumando lo que tenés en el banco más lo que te deben, y restando lo que debés pagar pronto."
        } else if (msgLower.includes('comision') || msgLower.includes('banco')) {
            reply = "La **Auditoría de Comisiones** compara lo que el banco te cobra realmente contra lo que pactaste en tu convenio. Detecta si te están cobrando comisiones de más."
        } else if (msgLower.includes('guardian') || msgLower.includes('precio') || msgLower.includes('aumento')) {
            reply = "El **Guardián de Gastos** detecta cuando un proveedor recurrente (luz, abono, alquiler) te cobra más de un 15% por encima de lo normal sin explicación."
        } else if (msgLower.includes('duplicado')) {
            reply = "El **Control de Duplicados** busca pagos idénticos (mismo monto y misma fecha) que se hayan realizado dos veces por error, algo común con terminales de tarjeta."
        } else if (msgLower.includes('fuga')) {
            reply = "La **Fuga de Capital** es una estimación de toda la plata que estás perdiendo por ineficiencias (impuestos no recuperados + costo de oportunidad)."
        } else {
            reply = "Puedo explicarte cualquier indicador: Saldo Operativo, Score, Costo de Oportunidad, Supervivencia, Recupero Impositivo, A Cobrar/Pagar, Valuación, Auditoría de Comisiones, Guardián de Gastos o Duplicados (en tu sección de **Auditoría AI**). ¿De cuál querés un ejemplo?"
        }
    }
    else {
        reply = "Entiendo tu consulta. Como tu CFO Algorítmico, puedo darte detalles sobre tus impuestos recuperables ($" + totalRecoverable.toLocaleString('es-AR') + "), explicarte el Score de Salud o analizar tus anomalías detectadas. ¿Qué prefieres profundizar?"
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
