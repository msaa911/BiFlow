export interface Invoice {
    id: string;
    tipo: 'factura_venta' | 'factura_compra' | 'nota_credito' | 'nota_debito';
    razon_social_socio: string;
    cuit_socio: string;
    fecha_emision: string;
    fecha_vencimiento: string;
    monto_total: number;
    monto_pendiente: number;
    estado: 'pendiente' | 'parcial' | 'pagado' | 'anulado';
}

export class TreasuryEngine {
    static INFLATION_FACTOR = 2.44;

    /**
     * Calculates the "Real Value" of an invoice adjusted by historical inflation
     * as provided by the user (2.44x).
     */
    static calculateAdjustedMonto(amount: number): number {
        return amount * this.INFLATION_FACTOR;
    }

    /**
     * Calculates the real loss due to inflation for a pending invoice.
     */
    static calculateInflationLoss(amount: number): number {
        return amount * (this.INFLATION_FACTOR - 1);
    }

    /**
     * Assigns a credit rating based on soci name or payment history (simulated for now).
     */
    static getClientRating(cuit: string, razonSocial: string): { rating: string; color: string } {
        // Mock logic: Some clients are more reliable
        if (razonSocial.includes('Lopez') || razonSocial.includes('Martinez')) {
            return { rating: 'A+', color: 'text-emerald-400' };
        }
        if (razonSocial.includes('Quantum') || razonSocial.includes('Sosa')) {
            return { rating: 'B-', color: 'text-yellow-400' };
        }
        return { rating: 'A', color: 'text-emerald-400' };
    }

    /**
     * Detects if a socio is both a client and a supplier (Netting opportunity).
     */
    static detectNettingOpportunities(invoices: Invoice[]): any[] {
        const salesSocio = new Set(invoices.filter(i => i.tipo === 'factura_venta').map(i => i.cuit_socio));
        const purchaseSocio = new Set(invoices.filter(i => i.tipo === 'factura_compra').map(i => i.cuit_socio));

        const intersections = [...salesSocio].filter(cuit => purchaseSocio.has(cuit));

        return intersections.map(cuit => {
            const socio = invoices.find(i => i.cuit_socio === cuit)?.razon_social_socio;
            const pendingAR = invoices.filter(i => i.cuit_socio === cuit && i.tipo === 'factura_venta' && i.estado !== 'pagado')
                .reduce((acc, curr) => acc + curr.monto_pendiente, 0);
            const pendingAP = invoices.filter(i => i.cuit_socio === cuit && i.tipo === 'factura_compra' && i.estado !== 'pagado')
                .reduce((acc, curr) => acc + curr.monto_pendiente, 0);

            return { cuit, socio, pendingAR, pendingAP, balance: pendingAR - pendingAP };
        });
    }

    /**
     * Estimates enterprise valuation based on current liquidity + AR - AP.
     */
    static calculateEnterpriseValuation(totalBalance: number, totalAR: number, totalAP: number): number {
        // Simplified dynamic valuation: Net Liquidity + Adjusted AR - AP
        return totalBalance + (totalAR * 0.9) - totalAP;
    }
}
