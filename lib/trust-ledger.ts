import { createClient } from '@/lib/supabase/client' // Using client for simpler server actions if needed, or import from server

export class TrustLedger {
    /**
     * Analiza una lista de transacciones buscando discrepancias de CBU (BEC Prevention).
     */
    static async validateTransactions(transactions: any[], orgId: string) {
        const supabase = createClient()

        // 1. Obtener pares CUIT-CBU confiables para esta organización
        const { data: trusted } = await supabase
            .from('trust_ledger')
            .select('cuit, cbu')
            .eq('organization_id', orgId)
            .eq('is_trusted', true)

        const trustedMap = new Map<string, Set<string>>()
        trusted?.forEach(t => {
            if (!trustedMap.has(t.cuit)) trustedMap.set(t.cuit, new Set())
            trustedMap.get(t.cuit)?.add(t.cbu)
        })

        const findings: any[] = []

        for (const tx of transactions) {
            const cbu = tx.metadata?.cbu
            const cuit = tx.cuit

            if (cbu && cuit) {
                const knownCBUs = trustedMap.get(cuit)
                // Si conocemos el CUIT pero el CBU es nuevo... ¡ALERTA!
                if (knownCBUs && !knownCBUs.has(cbu)) {
                    findings.push({
                        organization_id: orgId,
                        transaccion_id: tx.db_id, // assuming db_id is passed after insertion
                        tipo: 'anomalia',
                        severidad: 'critical',
                        detalle: {
                            razon: 'POSIBLE ESTAFA (BEC): CBU no habitual para este CUIT',
                            cbu_detectado: cbu,
                            cuits_conocidos: Array.from(knownCBUs),
                            is_bec: true
                        }
                    })
                }
            }
        }
        return findings
    }

    /**
     * Registra nuevos pares CUIT-CBU como confiables.
     */
    static async learn(transactions: any[], orgId: string) {
        const supabase = createClient()
        const newPairs = transactions
            .filter(t => t.cuit && t.metadata?.cbu)
            .map(t => ({
                organization_id: orgId,
                cuit: t.cuit,
                cbu: t.metadata.cbu,
                is_trusted: true,
                last_seen: new Date().toISOString()
            }))

        if (newPairs.length > 0) {
            await supabase.from('trust_ledger').upsert(newPairs, {
                onConflict: 'organization_id,cuit,cbu'
            })
        }
    }
}
