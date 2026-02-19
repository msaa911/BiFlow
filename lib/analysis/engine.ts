import { createClient } from '@/lib/supabase/server'
import { AnomalyEngine } from '@/lib/anomaly-engine'
import { LiquidityEngine } from '@/lib/liquidity-engine'

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
    const descriptions = [...new Set(transactions.map((t: any) => t.descripcion))]
    const { data: history } = await supabase.rpc('get_historical_averages', {
        p_org_id: organizationId,
        p_descriptions: descriptions,
        p_months_back: 3
    })
    const historyMap = new Map<string, number>(
        (history || []).map((h: any) => [h.descripcion, Number(h.avg_monto)])
    )

    // 3. Run Centralized Analysis using AnomalyEngine
    const { processed } = AnomalyEngine.analyze(
        transactions,
        historyMap,
        transactions, // Using the same batch for intra-batch duplicate check
        { windowDays: 30 } // 30-day window as requested in Task 1.1
    )

    // Clear existing detectado findings to allow "re-runs" to update data
    await supabase.from('hallazgos').delete().eq('organization_id', organizationId).eq('estado', 'detectado')

    // 4. Map Anomalies to database Findings
    for (const t of processed) {
        if (t.metadata?.anomaly) {
            findings.push({
                organization_id: organizationId,
                transaccion_id: t.id,
                tipo: t.metadata.anomaly, // Use direct type (duplicado/anomalia)
                severidad: t.metadata.severity || 'low',
                estado: 'detectado',
                monto_estimado_recupero: t.metadata.anomaly === 'price_spike'
                    ? Math.abs(t.monto) - Math.abs(t.metadata.historical_avg || 0)
                    : Math.abs(t.monto),
                detalle: {
                    razon: t.metadata.anomaly === 'duplicado' ? 'Posible duplicado (Ventana +/- 30 días)' : 'Anomalía detectada por motor IA',
                    ...t.metadata
                }
            })
        } else if (t.tags.includes('impuesto_recuperable')) {
            findings.push({
                organization_id: organizationId,
                transaccion_id: t.id,
                tipo: 'fuga_fiscal',
                severidad: 'medium',
                estado: 'detectado',
                monto_estimado_recupero: Math.abs(t.monto),
                detalle: {
                    razon: 'Retención impositiva / Gasto fiscal detectado',
                    ...t.metadata
                }
            })
        }
    }

    // --- NUEVO: AUDITORÍA DE ACUERDOS BANCARIOS ---
    const { data: agreement } = await supabase
        .from('convenios_bancarios')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .maybeSingle()

    if (agreement) {
        const auditFindings = await LiquidityEngine.verifyAgreements(transactions, agreement, organizationId)

        if (auditFindings.length > 0) {
            const { error: auditError } = await supabase.from('hallazgos_auditoria').insert(auditFindings)
            if (auditError) console.error('Error saving bank audit findings:', auditError)
        }
    }

    // 5. Save Findings
    if (findings.length > 0) {
        const { data: existingFindings } = await supabase
            .from('hallazgos')
            .select('transaccion_id, tipo')
            .eq('organization_id', organizationId)

        const existingSet = new Set(existingFindings?.map((f: any) => `${f.transaccion_id}-${f.tipo}`))
        const newFindings = findings.filter((f: any) => !existingSet.has(`${f.transaccion_id}-${f.tipo}`))

        if (newFindings.length > 0) {
            const { error: insertError } = await supabase.from('hallazgos').insert(newFindings)
            if (insertError) console.error('Error saving findings:', insertError)
            return { findings: newFindings.length + (agreement ? 1 : 0) } // Simplified count for audit findings too
        }
    }

    return { findings: 0 }
}
