export class AnomalyEngine {

    // Limits
    private static SPIKE_THRESHOLD = 0.15; // 15% deviation
    private static DUPLICATE_DAY_WINDOW = 0; // 0 = Exact same day

    /**
     * Detects potential anomalies in a batch of transactions.
     * Takes:
     * - transactions: New batch list.
     * - history: Map of <CuitOrConcept, AvgAmount> for the past 3 months.
     * - existingTransactions: List of transactions in the same period to check for double payments.
     */
    static analyze(transactions: any[], historyMap: Map<string, number>, existingTransactions: any[] = []) {
        const anomalies: any[] = [];
        const processed = transactions.map(t => {
            const metadata = { ...t.metadata };
            const tags = [...(t.tags || [])];

            let hasAnomaly = false;

            // 1. Duplicate Detection (Intra-batch & Inter-batch)
            const isDuplicate = this.checkDuplicate(t, transactions, existingTransactions);
            if (isDuplicate) {
                metadata.anomaly = 'duplicate';
                metadata.anomaly_score = 1.0;
                metadata.severity = 'high';
                tags.push('posible_duplicado');
                hasAnomaly = true;
            }

            // 2. Price Spike Detection (Recurrence Deviation)
            else if (t.monto < 0) { // Only for expenses
                // Prioritize CUIT for better accuracy, fallback to Concepto
                const key = t.cuit || t.descripcion;
                const avgAmount = historyMap.get(key);

                if (avgAmount) {
                    const currentAbs = Math.abs(t.monto);
                    const avgAbs = Math.abs(avgAmount);

                    const deviation = (currentAbs - avgAbs) / avgAbs;

                    if (deviation > this.SPIKE_THRESHOLD) {
                        metadata.anomaly = 'price_spike';
                        metadata.anomaly_score = deviation;
                        metadata.historical_avg = avgAmount;
                        metadata.severity = deviation > 0.5 ? 'critical' : 'high';
                        tags.push('alerta_precio');
                        hasAnomaly = true;
                    }
                }
            }

            // 3. Tax Identification (Recovery Opportunity)
            if (tags.includes('impuesto_recuperable')) {
                metadata.recovery_potential = true;
                metadata.severity = 'medium';
                hasAnomaly = true;
            }

            if (hasAnomaly) {
                anomalies.push({ ...t, metadata, tags });
            }

            return { ...t, metadata, tags };
        });

        return { processed, anomalies };
    }

    private static checkDuplicate(current: any, batch: any[], existing: any[]): boolean {
        // 1. Check against other items in the SAME batch
        const matchesInBatch = batch.filter(t => {
            if (t === current) return false; // Don't match itself

            return this.isFuzzyMatch(current, t);
        });

        if (matchesInBatch.length > 0) return true;

        // 2. Check against EXISTING DB transactions
        const matchesInHistory = existing.filter(t => this.isFuzzyMatch(current, t));

        return matchesInHistory.length > 0;
    }

    private static isFuzzyMatch(a: any, b: any): boolean {
        // Must be same day and same absolute amount
        if (a.fecha !== b.fecha) return false;
        if (Math.abs(a.monto) !== Math.abs(b.monto)) return false;

        // If CUIT matches, it's a strong duplicate
        if (a.cuit && b.cuit && a.cuit === b.cuit) return true;

        // POS/Gateway Fuzzy Match: "MERCADOPAGO * 123" vs "MERCADOPAGO * 456"
        const cleanDesc = (s: string) => s.toUpperCase().split(/[*#-]/)[0].trim();
        const descA = cleanDesc(a.descripcion || '');
        const descB = cleanDesc(b.descripcion || '');

        if (descA === descB && descA.length > 3) {
            // Check if it's a known gateway
            const gateways = ['MERCADOPAGO', 'MP', 'TIENDANUBE', 'POS', 'VTA', 'COMPRA', 'LINK', 'BANELCO', 'ESTABLECIMIENTO'];
            if (gateways.some(g => descA.includes(g))) return true;
        }

        // Default strict match if not a gateway
        return a.descripcion === b.descripcion;
    }
}
