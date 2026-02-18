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
    private static DEFAULT_ANNUAL_INTEREST_RATE = 0.70; // 70% TNA (Argentina average)

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
        overdraftLimit: number = 0
    ): StressTestResponse {
        let runningBalance = currentBalance
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
            runningBalance += payment.amount // Payments are negative, so += works

            if (runningBalance < lowestBalance) lowestBalance = runningBalance

            let alert: 'low' | 'medium' | 'high' | undefined = undefined
            if (runningBalance < 0) {
                alert = 'high'
                if (!failureDate) failureDate = payment.date
            } else if (runningBalance < currentBalance * 0.1) {
                alert = 'medium'
            }

            projection.push({
                date: payment.date,
                balance: runningBalance,
                alert
            })
        })

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
     */
    static calculateOpportunityCost(
        averageDailyBalance: number,
        days: number,
        annualRate: number = this.DEFAULT_ANNUAL_INTEREST_RATE
    ): number {
        if (averageDailyBalance <= 0) return 0;

        // Simple interest for the period
        const dailyRate = annualRate / 365;
        return averageDailyBalance * dailyRate * days;
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
