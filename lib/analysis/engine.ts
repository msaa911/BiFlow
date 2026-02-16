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
    // In production, we should paginate or filter by date
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

    // 2. Detect Duplicates
    // Group by (monto, cuit_destino) for negative amounts (payments)
    const payments = transactions.filter(t => t.monto < 0)
    const groups: Record<string, Transaction[]> = {}

    payments.forEach(t => {
        const key = `${t.monto}-${t.cuit_destino || 'unknown'}`
        if (!groups[key]) groups[key] = []
        groups[key].push(t)
    })

    Object.values(groups).forEach(group => {
        if (group.length > 1) {
            // Sort by date inside group (already sorted by query but good to ensure)
            group.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())

            for (let i = 1; i < group.length; i++) {
                const current = group[i]
                const prev = group[i - 1]

                const date1 = new Date(prev.fecha)
                const date2 = new Date(current.fecha)
                const diffTime = Math.abs(date2.getTime() - date1.getTime())
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

                if (diffDays <= 7) {
                    findings.push({
                        organization_id: organizationId,
                        transaccion_id: current.id,
                        tipo: 'duplicado',
                        severidad: 'high',
                        estado: 'detectado',
                        monto_estimado_recupero: Math.abs(current.monto),
                        detalle: {
                            razon: 'Pago idéntico detectado en lapso corto',
                            dias_diferencia: diffDays,
                            transaccion_original_id: prev.id,
                            fecha_original: prev.fecha
                        }
                    })
                }
            }
        }
    })

    // 3. Detect Fiscal Leaks (Retenciones)
    const keywords = ['RETENCION', 'PERCEPCION', 'SIRCREB', 'IIBB', 'IMPUESTO', 'DB.ALICUOTA']

    transactions.forEach(t => {
        const desc = t.descripcion.toUpperCase()
        if (keywords.some(k => desc.includes(k))) {
            // Avoid adding if already flagged as duplicate (though unlikely for leak)
            // Simple check logic

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
    })

    // 4. Save Findings
    if (findings.length > 0) {
        // Fetch existing findings to verify they don't exist already
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
