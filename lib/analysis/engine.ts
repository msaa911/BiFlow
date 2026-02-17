import { createClient } from '@/lib/supabase/server'
// 

interface Transaction {
    id: string
    organization_id: string
    fecha: string
    descripcion: string
    monto: number
    cuit_destino: string | null
}

interface Finding {
    organization_id: string
    transaccion_id: string
    tipo: 'duplicado' | 'fuga_fiscal' | 'anomalia'
    severidad: 'low' | 'medium' | 'high' | 'critical'
    estado: 'detectado'
    monto_estimado_recupero: number
    detalle: Record<string, any>
}

export async function runAnalysis(organizationId: string) {
    const supabase = await createClient()

    // 1. Fetch all transactions for the org
    const { data: transactions, error } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', organizationId)
        .order('fecha', { ascending: true })

    if (error || !transactions || transactions.length === 0) {
        console.log('No transactions found or error fetching')
        return { findings: 0 }
    }

    const findings: Finding[] = []

    // 2. Fetch Historical Averages (for Price Spike Detection)
    const descriptions = [...new Set(transactions.map(t => t.descripcion))]
    const { data: history } = await supabase.rpc('get_historical_averages', {
        p_org_id: organizationId,
        p_descriptions: descriptions,
        p_months_back: 3
    })
    const historyMap = new Map<string, number>(
        (history || []).map((h: any) => [h.descripcion, Number(h.avg_monto)])
    )

    // Helper for fuzzy match (consistency with AnomalyEngine)
    const isFuzzyDuplicate = (a: any, b: any) => {
        if (a.fecha !== b.fecha) return false
        if (Math.abs(a.monto) !== Math.abs(b.monto)) return false

        const clean = (s: string) => (s || '').toUpperCase().split(/[*#-]/)[0].trim()
        const d1 = clean(a.descripcion)
        const d2 = clean(b.descripcion)

        if (d1 === d2 && d1.length > 3) {
            const gateways = ['MERCADOPAGO', 'MP', 'TIENDANUBE', 'POS', 'VTA', 'COMPRA', 'LINK', 'BANELCO', 'ESTABLECIMIENTO']
            if (gateways.some(g => d1.includes(g))) return true
        }
        return a.descripcion === b.descripcion || (a.cuit && a.cuit === b.cuit)
    }

    // Process each transaction
    for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i]

        // --- A. Duplicate Detection ---
        const duplicate = transactions.find((prev, idx) => idx < i && isFuzzyDuplicate(t, prev))
        if (duplicate) {
            findings.push({
                organization_id: organizationId,
                transaccion_id: t.id,
                tipo: 'duplicado',
                severidad: 'high',
                estado: 'detectado',
                monto_estimado_recupero: Math.abs(t.monto),
                detalle: {
                    razon: 'Posible duplicado (Fuzzy POS detection)',
                    transaccion_original_id: duplicate.id,
                    fecha_original: duplicate.fecha
                }
            })
        }

        // --- B. Price Spike Detection ---
        if (t.monto < 0) {
            const avg = historyMap.get(t.descripcion)
            if (avg) {
                const currentAbs = Math.abs(t.monto)
                const avgAbs = Math.abs(avg)
                const deviation = (currentAbs - avgAbs) / avgAbs

                if (deviation > 0.15) {
                    findings.push({
                        organization_id: organizationId,
                        transaccion_id: t.id,
                        tipo: 'anomalia',
                        severidad: deviation > 0.5 ? 'critical' : 'high',
                        estado: 'detectado',
                        monto_estimado_recupero: currentAbs - avgAbs,
                        detalle: {
                            razon: 'Desvío de precio detectado (>15%)',
                            promedio_historico: avg,
                            desvio: deviation
                        }
                    })
                }
            }
        }

        // --- C. Fiscal Leaks (Retenciones) ---
        const desc = t.descripcion.toUpperCase()
        const keywords = ['RETENCION', 'PERCEPCION', 'SIRCREB', 'IIBB', 'IMPUESTO', 'DB.ALICUOTA']
        if (keywords.some(k => desc.includes(k))) {
            findings.push({
                organization_id: organizationId,
                transaccion_id: t.id,
                tipo: 'fuga_fiscal',
                severidad: 'medium',
                estado: 'detectado',
                monto_estimado_recupero: Math.abs(t.monto),
                detalle: {
                    razon: 'Retención impositiva / Gasto fiscal detectado',
                    concepto_detectado: keywords.find(k => desc.includes(k))
                }
            })
        }
    }

    // 4. Save Findings
    if (findings.length > 0) {
        const { data: existingFindings } = await supabase
            .from('hallazgos')
            .select('transaccion_id, tipo')
            .eq('organization_id', organizationId)

        const existingSet = new Set(existingFindings?.map(f => `${f.transaccion_id}-${f.tipo}`))
        const newFindings = findings.filter(f => !existingSet.has(`${f.transaccion_id}-${f.tipo}`))

        if (newFindings.length > 0) {
            const { error: insertError } = await supabase.from('hallazgos').insert(newFindings)
            if (insertError) console.error('Error saving findings:', insertError)
            return { findings: newFindings.length }
        }
    }

    return { findings: 0 }
}
