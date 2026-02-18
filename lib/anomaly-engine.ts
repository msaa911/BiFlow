export class AnomalyEngine {

    // Limits
    private static SPIKE_THRESHOLD = 0.15; // 15% deviation
    private static DUPLICATE_DAY_WINDOW = 30; // 30 days window for duplicate detection

    /**
     * Detects potential anomalies in a batch of transactions.
     */
    static analyze(
        transactions: any[],
        historyMap: Map<string, number>,
        existingTransactions: any[] = [],
        config: { windowDays?: number } = { windowDays: AnomalyEngine.DUPLICATE_DAY_WINDOW }
    ) {
        const anomalies: any[] = [];
        const processed = transactions.map(t => {
            const metadata = { ...t.metadata };
            const tags = [...(t.tags || [])];

            let hasAnomaly = false;

            // 1. Duplicate Detection (Intra-batch & Inter-batch)
            const isDuplicate = this.checkDuplicate(t, transactions, existingTransactions, config.windowDays);
            if (isDuplicate) {
                metadata.anomaly = 'duplicate';
                metadata.anomaly_score = 1.0;
                metadata.severity = 'high';
                metadata.window_check = config.windowDays;
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
                if (!metadata.severity) metadata.severity = 'medium';
                hasAnomaly = true;
            }

            if (hasAnomaly) {
                anomalies.push({ ...t, metadata, tags });
            }

            return { ...t, metadata, tags };
        });

        return { processed, anomalies };
    }

    private static checkDuplicate(current: any, batch: any[], existing: any[], windowDays: number = 30): boolean {
        // 1. Check against other items in the SAME batch
        const matchesInBatch = batch.filter(t => {
            if (t === current) return false; // Don't match itself
            return this.isFuzzyMatch(current, t, windowDays);
        });

        if (matchesInBatch.length > 0) return true;

        // 2. Check against EXISTING DB transactions
        const matchesInHistory = existing.filter(t => this.isFuzzyMatch(current, t, windowDays));

        return matchesInHistory.length > 0;
    }

    private static isFuzzyMatch(a: any, b: any, windowDays: number = 30): boolean {
        // Date window check
        const dateA = new Date(a.fecha);
        const dateB = new Date(b.fecha);
        const diffTime = Math.abs(dateA.getTime() - dateB.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > windowDays) return false;

        // Amount check (strict absolute match)
        if (Math.abs(a.monto) !== Math.abs(b.monto)) return false;

        // If CUIT matches, it's a strong duplicate
        if (a.cuit && b.cuit && a.cuit === b.cuit) return true;

        // POS/Gateway Fuzzy Match: "MERCADOPAGO * 123" vs "MERCADOPAGO * 456"
        const cleanDesc = (s: string) => s.toUpperCase()
            .replace(/[0-9]{5,}/g, '') // Remove long numbers (ID, Trans ID)
            .split(/[*#-]/)[0]
            .trim();

        const descA = cleanDesc(a.descripcion || a.concepto || '');
        const descB = cleanDesc(b.descripcion || b.concepto || '');

        if (descA === descB && descA.length > 3) {
            // Check if it's a known gateway or high-volume merchant
            const gateways = [
                'MERCADOPAGO', 'MP', 'TIENDANUBE', 'POS', 'VTA', 'COMPRA', 'LINK', 'BANELCO',
                'ESTABLECIMIENTO', 'PEDIDOSYA', 'RAPPI', 'UBER', 'CABIFY', 'COMISION', 'MANT'
            ];
            if (gateways.some(g => descA.includes(g))) return true;
        }

        // Default strict match if not a gateway
        return (a.descripcion || a.concepto) === (b.descripcion || b.concepto);
    }
}
