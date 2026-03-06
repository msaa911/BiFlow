import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AnomalyEngine } from '@/lib/anomaly-engine'
import { LiquidityEngine } from '@/lib/liquidity-engine'

interface Transaction {
    id: string
    organization_id: string
    fecha: string
    descripcion: string
    monto: number
    cuit_destino: string | null
    tags?: string[]
    metadata?: any
}

interface Invoice {
    id: string
    organization_id: string
    tipo: string
    numero: string
    cuit_entidad: string
    razon_social_entidad: string
    fecha_emision: string
    monto_total: number
    estado: string
    metadata?: any
}

interface TaxConfig {
    patron_busqueda: string;
    es_recuperable: boolean;
    omitir_siempre: boolean;
    estado: 'PENDIENTE' | 'CLASIFICADO' | 'IGNORADO';
    categoria?: 'impuesto' | 'servicio';
}

interface Finding {
    organization_id: string
    transaccion_id?: string
    comprobante_id?: string
    tipo: 'duplicado' | 'fuga_fiscal' | 'anomalia' | 'desvio_precio' | 'monto_inusual'
    severidad: 'low' | 'medium' | 'high' | 'critical'
    estado: 'detectado'
    monto_estimado_recupero: number
    detalle: Record<string, any>
}

export async function runAnalysis(organizationId: string) {
    // Use Admin Client to bypass RLS and ensure complete analysis
    const supabase = createAdminClient()

    console.log(`[ANALYSIS] Starting analysis for org: ${organizationId}`)

    // 1. Fetch all transactions for the org
    const { data: transactions, error } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', organizationId)
        .order('fecha', { ascending: true })

    // 1b. Fetch pending invoices (AP/AR)
    const { data: invoices } = await supabase
        .from('comprobantes')
        .select('*')
        .eq('organization_id', organizationId)
        .neq('estado', 'pagado')
        .order('fecha_emision', { ascending: true })

    if (error) {
        console.error('[ANALYSIS] Error fetching transactions:', error.message)
        return { findings: 0 }
    }

    if ((!transactions || transactions.length === 0) && (!invoices || invoices.length === 0)) {
        console.log('[ANALYSIS] No data found for analysis')
        return { findings: 0 }
    }

    console.log(`[ANALYSIS] Found ${transactions.length} transactions`)

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

    // 3. Fetch Tax Configurations
    const { data: taxConfigs } = await supabase
        .from('tax_intelligence_rules')
        .select('*')
        .eq('organization_id', organizationId)

    const taxMap = new Map<string, TaxConfig>(
        (taxConfigs || []).map((c: any) => [c.patron_busqueda.toUpperCase(), c])
    )

    // 3b. Statistical Calculations for Outlier Detection (Z-Score)
    // Combine transactions and invoices for a broader context of "normal" amounts
    const allAmounts = [
        ...(transactions || []).map((t: any) => Math.abs(t.monto)),
        ...(invoices || []).map((i: any) => Math.abs(i.monto_total))
    ].filter(a => a > 0);

    const mean = allAmounts.length > 0 ? allAmounts.reduce((a, b) => a + b, 0) / allAmounts.length : 0;
    const stdDev = allAmounts.length > 0 ? Math.sqrt(allAmounts.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / allAmounts.length) : 0;

    console.log(`[ANALYSIS] Stats: Mean=${mean.toFixed(2)}, StdDev=${stdDev.toFixed(2)}, SampleSize=${allAmounts.length}`);

    // 4. Run Centralized Analysis using AnomalyEngine
    const { processed } = AnomalyEngine.analyze(
        transactions,
        historyMap,
        transactions, // Using the same batch for intra-batch duplicate check
        { windowDays: 30 } // 30-day window as requested in Task 1.1
    )

    // Keywords categorized to avoid confusion (Services vs direct Taxes)
    const KEYWORD_GROUPS = [
        {
            category: 'impuesto',
            keywords: ['AFIP', 'ARBA', 'RETENCION', 'PERCEPCION', 'IIBB', 'SUSS', 'IMPUESTO', 'IVA', 'GANANCIAS', 'BIENES PERSONALES', 'DREI', 'CANON']
        },
        {
            category: 'servicio',
            keywords: ['AYSA', 'EDENOR', 'EDESUR', 'METROGAS', 'TELECOM', 'PERSONAL', 'CLARO', 'MOVISTAR', 'TELMEX']
        }
    ]

    // Flatten for easy searching while keeping category info
    const ALL_KEYWORDS = KEYWORD_GROUPS.flatMap(g => g.keywords.map(k => ({ word: k, category: g.category })))

    const newTaxConfigs: any[] = []
    const seenNewPatrons = new Set<string>()

    console.log(`[ANALYSIS] Processing ${processed.length} transactions for tax detection...`)

    // Clear existing detectado findings to allow "re-runs" to update data
    console.log(`[ANALYSIS] Clearing old findings for org ${organizationId}...`)
    const { error: clearError } = await supabase.from('hallazgos').delete().eq('organization_id', organizationId).eq('estado', 'detectado')
    if (clearError) console.error('[ANALYSIS] Clear findings error:', clearError.message)

    // 5. Map Anomalies & Handle Tax Learning
    const transactionsToUpdate: any[] = []

    for (const t of processed) {
        const descUpper = t.descripcion.toUpperCase()

        // Improved detection: use word boundaries for short keywords to avoid false positives (e.g. "IVA" in "RIVAS")
        const match = ALL_KEYWORDS.find(k => {
            if (k.word.length <= 8) {
                const regex = new RegExp(`\\b${k.word}\\b`, 'i');
                return regex.test(descUpper);
            }
            return descUpper.includes(k.word);
        })

        if (match) {
            console.log(`[ANALYSIS] [MATCH] "${t.descripcion}" matched with keyword "${match.word}" (${match.category})`)
            const config = taxMap.get(descUpper)

            if (!config) {
                console.log(`[ANALYSIS] [NEW_TAX] No config found for "${t.descripcion}". Creating PENDIENTE rule.`)
                // First time seeing this patron in this org
                if (!seenNewPatrons.has(descUpper)) {
                    console.log(`[ANALYSIS] [LEGAL_LEARNING] Registering new rule for patron: "${t.descripcion}"`);
                    newTaxConfigs.push({
                        organization_id: organizationId,
                        patron_busqueda: t.descripcion,
                        categoria: match.category,
                        estado: 'PENDIENTE'
                    })
                    seenNewPatrons.add(descUpper)
                }

                // Tag the transaction based on category
                const tag = match.category === 'impuesto' ? 'pendiente_clasificacion' : 'servicio_detectado'
                // Clean old tags to avoid mixing categories after logic update
                let tags = (t.tags || []).filter((tg: string) => tg !== 'pendiente_clasificacion' && tg !== 'servicio_detectado')

                if (!tags.includes(tag)) {
                    tags.push(tag)
                    t.tags = tags
                    transactionsToUpdate.push({ id: t.id, tags: t.tags })
                }
            } else if (config.estado === 'PENDIENTE') {
                console.log(`[ANALYSIS] [EXISTING_PENDING] "${t.descripcion}" is already PENDIENTE.`)
                const tag = match.category === 'impuesto' ? 'pendiente_clasificacion' : 'servicio_detectado'
                // Clean old tags to avoid mixing categories after logic update
                let tags = (t.tags || []).filter((tg: string) => tg !== 'pendiente_clasificacion' && tg !== 'servicio_detectado')

                if (!tags.includes(tag)) {
                    tags.push(tag)
                    t.tags = tags
                    transactionsToUpdate.push({ id: t.id, tags: t.tags })
                }
            } else if (config.es_recuperable && !config.omitir_siempre) {
                console.log(`[ANALYSIS] [RECUPERABLE] "${t.descripcion}" is classified as tax recovery.`)
                // Already classified as manageable tax
                let tags = (t.tags || []).filter((tg: string) => tg !== 'pendiente_clasificacion' && tg !== 'servicio_detectado' && tg !== 'costo_impositivo' && tg !== 'gasto_simple')
                if (!tags.includes('impuesto_recuperable')) {
                    tags.push('impuesto_recuperable')
                    t.tags = tags
                    transactionsToUpdate.push({ id: t.id, tags: t.tags })
                }

                findings.push({
                    organization_id: organizationId,
                    transaccion_id: t.id,
                    tipo: 'fuga_fiscal',
                    severidad: 'medium',
                    estado: 'detectado',
                    monto_estimado_recupero: Math.abs(t.monto),
                    detalle: {
                        razon: 'Impuesto clasificado como RECUPERABLE por usuario',
                        ...t.metadata
                    }
                })
            } else if (!config.es_recuperable && !config.omitir_siempre && config.estado === 'CLASIFICADO') {
                console.log(`[ANALYSIS] [COSTO] "${t.descripcion}" classified as non-recoverable.`)
                const tag = config.categoria === 'servicio' ? 'gasto_simple' : 'costo_impositivo'
                let tags = (t.tags || []).filter((tg: string) =>
                    tg !== 'pendiente_clasificacion' &&
                    tg !== 'servicio_detectado' &&
                    tg !== 'impuesto_recuperable' &&
                    tg !== 'costo_impositivo' &&
                    tg !== 'gasto_simple'
                )

                if (!tags.includes(tag)) {
                    tags.push(tag)
                    t.tags = tags
                    transactionsToUpdate.push({ id: t.id, tags: t.tags })
                }
            }
            continue
        }

        if (t.metadata?.anomaly) {
            console.log(`[ANALYSIS] [ANOMALY] "${t.descripcion}" identified as ${t.metadata.anomaly}`)
            findings.push({
                organization_id: organizationId,
                transaccion_id: t.id,
                tipo: t.metadata.anomaly,
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
            // Persist tags (e.g. 'posible_duplicado', 'alerta_precio') to the transacciones table
            transactionsToUpdate.push({ id: t.id, tags: t.tags })
        } else if (stdDev > 0 && Math.abs(t.monto) > mean + (3 * stdDev)) {
            // Statistical Outlier Detection (Z-Score > 3)
            console.log(`[ANALYSIS] [OUTLIER] "${t.descripcion}" is a statistical outlier ($ID: ${t.id})`)
            const zScore = (Math.abs(t.monto) - mean) / stdDev;
            findings.push({
                organization_id: organizationId,
                transaccion_id: t.id,
                tipo: 'monto_inusual',
                severidad: zScore > 5 ? 'critical' : 'high',
                estado: 'detectado',
                monto_estimado_recupero: 0,
                detalle: {
                    razon: `Monto inusual detectado estadísticamente (Z-Score: ${zScore.toFixed(2)})`,
                    monto: t.monto,
                    promedio_empresa: mean,
                    desviacion_estandar: stdDev
                }
            });
            let tags = t.tags || [];
            if (!tags.includes('alerta_precio')) {
                tags.push('alerta_precio');
                transactionsToUpdate.push({ id: t.id, tags });
            }
        }
    }

    // 6. Analyze Invoices for Anomalies
    console.log(`[ANALYSIS] Auditing ${invoices?.length || 0} pending invoices...`);
    if (invoices) {
        for (const inv of invoices) {
            const absMonto = Math.abs(inv.monto_total);
            if (stdDev > 0 && absMonto > mean + (3 * stdDev)) {
                const zScore = (absMonto - mean) / stdDev;
                console.log(`[ANALYSIS] [INVOICE_OUTLIER] Factura ${inv.numero} is an outlier (${inv.razon_social_entidad || inv.razon_social_socio})`);
                findings.push({
                    organization_id: organizationId,
                    comprobante_id: inv.id,
                    tipo: 'monto_inusual',
                    severidad: zScore > 5 ? 'critical' : 'high',
                    estado: 'detectado',
                    monto_estimado_recupero: 0,
                    detalle: {
                        razon: `Factura con monto inusual (Z-Score: ${zScore.toFixed(2)})`,
                        monto: inv.monto_total,
                        promedio_empresa: mean,
                        desviacion_estandar: stdDev,
                        entidad: inv.razon_social_entidad || inv.razon_social_socio
                    }
                });
            }
        }
    }

    // --- NUEVO: TRUST LEDGER (BEC PREVENTION) ---
    const { TrustLedger } = require('@/lib/trust-ledger')
    console.log(`[ANALYSIS] Running TrustLedger check...`)
    const becAlerts = await TrustLedger.validateTransactions(transactions, organizationId)
    if (becAlerts.length > 0) {
        console.log(`[ANALYSIS] TrustLedger found ${becAlerts.length} alerts`)
        findings.push(...becAlerts)
    }
    // Update profiles
    await TrustLedger.learn(transactions, organizationId)

    // Save New Tax Configs
    if (newTaxConfigs.length > 0) {
        console.log(`[ANALYSIS] Saving ${newTaxConfigs.length} new tax configurations...`)
        const { error: upsertError } = await supabase.from('tax_intelligence_rules').upsert(newTaxConfigs, {
            onConflict: 'organization_id, patron_busqueda',
            ignoreDuplicates: true
        })
        if (upsertError) console.error('[ANALYSIS] Error saving tax configs:', upsertError.message)
    }

    // Update Transaction Tags (if modified)
    if (transactionsToUpdate.length > 0) {
        console.log(`[ANALYSIS] Updating tags for ${transactionsToUpdate.length} transactions...`)
        for (const update of transactionsToUpdate) {
            const { error: tagError } = await supabase.from('transacciones').update({ tags: update.tags }).eq('id', update.id)
            if (tagError) console.error(`[ANALYSIS] Error updating tag for ${update.id}:`, tagError.message)
        }
    }

    // --- NUEVO: AUDITORÍA DE ACUERDOS BANCARIOS ---
    console.log(`[ANALYSIS] Checking bank agreements...`)
    const { data: agreement } = await supabase
        .from('convenios_bancarios')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .maybeSingle()

    if (agreement) {
        const auditFindings = await LiquidityEngine.verifyAgreements(transactions, agreement, organizationId)
        if (auditFindings.length > 0) {
            console.log(`[ANALYSIS] Bank audit found ${auditFindings.length} findings`)
            await supabase.from('hallazgos_auditoria').delete().eq('organization_id', organizationId) // Clear old audit findings
            const { error: auditError } = await supabase.from('hallazgos_auditoria').insert(auditFindings)
            if (auditError) console.error('Error saving bank audit findings:', auditError)
        }
    }

    // 5. Save Findings
    if (findings.length > 0) {
        console.log(`[ANALYSIS] Saving ${findings.length} findings...`)
        const { data: existingFindings } = await supabase
            .from('hallazgos')
            .select('transaccion_id, tipo')
            .eq('organization_id', organizationId)

        const existingSet = new Set(existingFindings?.map((f: any) => f.transaccion_id ? `${f.transaccion_id}-${f.tipo}` : `${f.comprobante_id}-${f.tipo}`))
        const newFindings = findings.filter((f: any) => {
            const key = f.transaccion_id ? `${f.transaccion_id}-${f.tipo}` : `${f.comprobante_id}-${f.tipo}`;
            return !existingSet.has(key);
        })

        if (newFindings.length > 0) {
            console.log(`[ANALYSIS] Inserting ${newFindings.length} NEW findings...`)
            const { error: insertError } = await supabase.from('hallazgos').insert(newFindings)
            if (insertError) console.error('[ANALYSIS] Error saving findings:', insertError.message)
            return { findings: newFindings.length + (agreement ? 1 : 0) }
        }
    }

    console.log(`[ANALYSIS] Analysis finished for org ${organizationId}.`)
    return { findings: 0 }
}
