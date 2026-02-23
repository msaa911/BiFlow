export interface LiquidityProjection {
    date: string;
    balance: number;
    alert?: 'low' | 'medium' | 'high';
}

export interface StressTestResponse {
    projection: LiquidityProjection[];
    lowestBalance: number;
    survivalDays: number;
    alertLevel: 'low' | 'medium' | 'high';
}

export class LiquidityEngine {
    private static DEFAULT_ANNUAL_INTEREST_RATE = 0.35; // 35% TNA (Argentina 2026 average)

    /**
     * Proyecta el saldo futuro basándose en pagos pendientes y el saldo actual.
     */
    /**
     * Simulates the impact of a batch of imported transactions on the current liquidity.
     * This follows the "Zero Data Entry" philosophy by using files as the simulation input.
     */
    static projectFromBatch(
        currentBalance: number,
        newBatch: { descripcion: string, monto: number, fecha: string }[],
        overdraftLimit: number = 0
    ): StressTestResponse {
        return this.simulateStressTest(currentBalance, newBatch, overdraftLimit);
    }

    static simulateStressTest(
        currentBalance: number,
        plannedPayments: { description?: string, descripcion?: string, amount?: number, monto?: number, date?: string, fecha?: string }[],
        overdraftLimit: number = 0,
        monthlyInflation: number = 0
    ): StressTestResponse {
        let runningBalance = currentBalance
        const now = new Date()
        const projection: { date: string, balance: number, alert?: 'low' | 'medium' | 'high' }[] = []

        // Normalize keys for both manual and batch inputs
        const normalizedPayments = plannedPayments.map(p => ({
            description: p.description || p.descripcion || 'Sin concepto',
            amount: p.amount !== undefined ? p.amount : (p.monto || 0),
            date: p.date || p.fecha || new Date().toISOString()
        })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        let lowestBalance = currentBalance
        let alertLevel: 'low' | 'medium' | 'high' = 'low'
        let failureDate: string | null = null

        normalizedPayments.forEach(payment => {
            const paymentDate = new Date(payment.date)
            const monthsDiff = Math.max(0, (paymentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44))

            // Adjust for inflation (compounded monthly)
            const inflationMultiplier = Math.pow(1 + monthlyInflation, monthsDiff)
            const amount = (Number(payment.amount) || 0) * inflationMultiplier;

            // FIX: Subtract payments instead of adding them (Stress test is for outflows)
            runningBalance -= amount;
            runningBalance = Math.round(runningBalance * 100) / 100; // Round to 2 decimals

            if (runningBalance < lowestBalance) lowestBalance = runningBalance

            let alert: 'low' | 'medium' | 'high' | undefined = undefined
            // High alert if balance goes below zero (overdraft handled later)
            if (runningBalance < 0) {
                alert = 'high'
                if (!failureDate) failureDate = payment.date
            } else if (runningBalance < currentBalance * 0.2) { // 20% cushion instead of 10%
                alert = 'medium'
            }

            projection.push({
                date: payment.date,
                balance: runningBalance,
                alert
            })
        })

        // Check against actual overdraft limit
        if (lowestBalance < -overdraftLimit) alertLevel = 'high'
        else if (lowestBalance < 0) alertLevel = 'medium'

        return {
            projection,
            alertLevel,
            lowestBalance,
            survivalDays: failureDate
                ? Math.ceil((new Date(failureDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : 30 // Defaults to 30 if survives the batch
        }
    }

    /**
     * Calcula el costo de oportunidad de dinero ocioso.
     * annualRate puede venir de configuracion_empresa (Manual) o indices_mercado (Automático)
     */
    static calculateOpportunityCost(
        averageDailyBalance: number,
        days: number,
        annualRate: number = this.DEFAULT_ANNUAL_INTEREST_RATE,
        liquidityCushion: number = 0
    ): number {
        const investableBalance = averageDailyBalance - liquidityCushion;
        if (investableBalance <= 0) return 0;

        // Simple interest for the period (TNA)
        const dailyRate = annualRate / 365;
        return investableBalance * dailyRate * days;
    }

    /**
     * Audita transacciones contra convenios bancarios pactados.
     */
    static async verifyAgreements(
        transactions: any[],
        agreement: { mantenimiento_mensual_pactado: number, comision_cheque_porcentaje: number },
        orgId: string
    ) {
        const findings: any[] = [];

        for (const tx of transactions) {
            const desc = tx.descripcion.toLowerCase();
            const montoAbs = Math.abs(tx.monto);

            // 1. Auditoría de Comisiones de Cheque (asumiendo monto de referencia en metadata si existiera, o sobre el total si es el item)
            // Para simplificar buscamos palabras clave como 'comision' y 'cheque'
            if (desc.includes('comision') && desc.includes('cheque') && agreement.comision_cheque_porcentaje > 0) {
                // Si la tx es la comisión en sí, necesitamos el monto base. 
                // Asumiendo que tx.monto es la comisión cobrada.
                // En una implementación real buscaríamos la tx vinculada (el depósito) o usaríamos el monto base si viniera en metadata.
                const montoBaseHeuristico = tx.metadata?.monto_base || (montoAbs / agreement.comision_cheque_porcentaje);
                const maxPermitido = montoBaseHeuristico * agreement.comision_cheque_porcentaje;

                if (montoAbs > maxPermitido + 0.01) { // Margen de centavos
                    findings.push({
                        organization_id: orgId,
                        transaccion_id: tx.id,
                        tipo_error: 'COMISION_EXCEDIDA',
                        monto_esperado: maxPermitido,
                        monto_real: montoAbs,
                        diferencia: montoAbs - maxPermitido,
                        notas_ia: `Se cobró un ${((montoAbs / montoBaseHeuristico) * 100).toFixed(2)}% cuando el pactado es ${(agreement.comision_cheque_porcentaje * 100).toFixed(2)}%.`
                    });
                }
            }

            // 2. Mantenimiento Mensual (se dispararía una vez al mes)
            if (desc.includes('mantenimiento') && agreement.mantenimiento_mensual_pactado > 0) {
                if (montoAbs > agreement.mantenimiento_mensual_pactado + 1) {
                    findings.push({
                        organization_id: orgId,
                        transaccion_id: tx.id,
                        tipo_error: 'COMISION_EXCEDIDA', // O CARGO_NO_PACTADO
                        monto_esperado: agreement.mantenimiento_mensual_pactado,
                        monto_real: montoAbs,
                        diferencia: montoAbs - agreement.mantenimiento_mensual_pactado,
                        notas_ia: `El mantenimiento cobrado excede el pactado mensual de $${agreement.mantenimiento_mensual_pactado}.`
                    });
                }
            }
        }

        return findings;
    }

    /**
     * Calcula un Score de Salud de Caja (0-100)
     */
    static calculateHealthScore(
        currentBalance: number,
        monthlyAverageExpenses: number,
        overdraftLimit: number = 0
    ): number {
        const totalLiquidity = currentBalance + overdraftLimit;
        if (monthlyAverageExpenses <= 0) return totalLiquidity > 0 ? 100 : 0;

        const monthsOfRunway = totalLiquidity / monthlyAverageExpenses;

        // Runway-based scoring:
        // 1 month = 100 points
        // 0.5 month = 50 points
        // 0 months = 0 points
        let score = Math.max(0, Math.min(100, monthsOfRunway * 100));

        // Bonus for having overhead vs Monthly Average
        return Math.round(score);
    }
}
