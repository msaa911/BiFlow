import { DailyBalance } from './treasury-engine';

export interface PortfolioKPIs {
    totalInPortfolio: number;
    toExpireSoon: number;
    totalRejected: number;
    riskScore: number;
}

export class PortfolioEngine {
    /**
     * Calcula KPIs de la cartera de cheques.
     */
    static calculateKPIs(checks: any[]): PortfolioKPIs {
        const today = new Date();
        const seventhDay = new Date();
        seventhDay.setDate(today.getDate() + 7);

        const totalInPortfolio = checks
            .filter(c => c.estado === 'pendiente')
            .reduce((acc, curr) => acc + Number(curr.monto), 0);

        const toExpireSoon = checks
            .filter(c => c.estado === 'pendiente' && new Date(c.fecha_disponibilidad) <= seventhDay)
            .reduce((acc, curr) => acc + Number(curr.monto), 0);

        const totalRejected = checks
            .filter(c => c.estado === 'rechazado')
            .reduce((acc, curr) => acc + Number(curr.monto), 0);

        const totalVolume = checks.reduce((acc, curr) => acc + Number(curr.monto), 0);
        const riskScore = totalVolume > 0 ? (totalRejected / totalVolume) * 100 : 0;

        return {
            totalInPortfolio,
            toExpireSoon,
            totalRejected,
            riskScore: Math.round(riskScore * 100) / 100
        };
    }

    /**
     * Proyecta la liquidez incorporando el impacto de los cheques en cartera según su fecha de disponibilidad.
     */
    static projectWithChecks(
        baseProjection: DailyBalance[],
        checks: any[]
    ): DailyBalance[] {
        // Sort checks by date
        const sortedChecks = [...checks]
            .filter(c => c.estado === 'pendiente' || c.estado === 'depositado')
            .sort((a, b) => new Date(a.fecha_disponibilidad).getTime() - new Date(b.fecha_disponibilidad).getTime());

        return baseProjection.map(p => {
            const projectionDate = new Date(p.date).getTime();

            // Sum checks available on or before this projection day
            const availableChecksSum = sortedChecks
                .filter(c => new Date(c.fecha_disponibilidad).getTime() <= projectionDate)
                .reduce((acc, curr) => acc + Number(curr.monto), 0);

            return {
                ...p,
                balanceWithChecks: p.balance + availableChecksSum
            };
        });
    }

    /**
     * Identifica cheques que ya deberían haberse acreditado según su fecha de disponibilidad pero siguen en estado 'depositado'.
     */
    static getStaleDeposits(checks: any[]): any[] {
        const today = new Date().getTime();
        return checks.filter(c =>
            c.estado === 'depositado' &&
            new Date(c.fecha_disponibilidad).getTime() < today - (1000 * 60 * 60 * 24 * 2) // 48hs grace
        );
    }
}
