export interface Invoice {
    id: string;
    tipo: 'factura_venta' | 'factura_compra' | 'nota_credito' | 'nota_debito';
    razon_social_entidad: string;
    razon_social_socio?: string;
    cuit_entidad: string;
    cuit_socio?: string;
    nro_factura?: string;
    numero?: string;
    fecha_emision: string;
    fecha_vencimiento: string;
    monto_total: number;
    monto_pendiente: number;
    estado: 'pendiente' | 'parcial' | 'pagado' | 'anulado';
    concepto?: string;
}

export interface ProjectedMovement {
    id: string;
    descripcion: string;
    monto: number;
    fecha: string;
    isProjected: boolean;
}

export interface DailyBalance {
    date: string;
    balance: number;
    balanceWithChecks?: number;
    isProjected: boolean;
    isAlert?: boolean;
}

export class TreasuryEngine {
    static INFLATION_FACTOR = 1.08;

    /**
     * Projects daily balance for the next 30 days based on current balance,
     * pending invoices, and projected simulation movements.
     */
    static projectDailyBalance(
        currentBalance: number,
        invoices: Invoice[],
        projects: ProjectedMovement[],
        liquidityBuffer: number = 0
    ): DailyBalance[] {
        const projection: DailyBalance[] = [];
        const today = new Date();

        // Combine all relevant movements
        const movements = [
            ...invoices.filter(i => i.estado !== 'pagado').map(i => ({
                fecha: i.fecha_vencimiento,
                monto: i.tipo === 'factura_venta' || i.tipo === 'nota_debito' ? i.monto_pendiente : -i.monto_pendiente,
                isProjected: false
            })),
            ...projects.map(p => ({
                fecha: p.fecha,
                monto: p.monto,
                isProjected: true
            }))
        ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        let runningBalance = currentBalance;

        // Generate a 30-day window
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];

            // Apply movements for this specific date
            const dateMovements = movements.filter(m => m.fecha === dateStr);
            dateMovements.forEach(m => runningBalance += m.monto);

            projection.push({
                date: dateStr,
                balance: runningBalance,
                isProjected: i > 0,
                isAlert: runningBalance < liquidityBuffer
            });
        }

        return projection;
    }

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
     * Assigns a credit rating based on entity name or payment history (simulated for now).
     */
    static getClientRating(cuit: string, razonSocial: string): { rating: string; color: string } {
        const name = razonSocial || '';
        if (name.includes('Lopez') || name.includes('Martinez')) {
            return { rating: 'A+', color: 'text-emerald-400' };
        }
        if (name.includes('Quantum') || name.includes('Sosa')) {
            return { rating: 'B-', color: 'text-yellow-400' };
        }
        return { rating: 'A', color: 'text-emerald-400' };
    }

    /**
     * Detects if an entity is both a client and a supplier (Netting opportunity).
     */
    static detectNettingOpportunities(invoices: Invoice[]): any[] {
        const salesEntidades = new Set(invoices.filter(i => i.tipo === 'factura_venta').map(i => i.cuit_entidad));
        const purchaseEntidades = new Set(invoices.filter(i => i.tipo === 'factura_compra').map(i => i.cuit_entidad));

        const intersections = [...salesEntidades].filter(cuit => purchaseEntidades.has(cuit));

        return intersections.map(cuit => {
            const entidad_nombre = invoices.find(i => i.cuit_entidad === cuit)?.razon_social_entidad;
            const pendingAR = invoices.filter(i => i.cuit_entidad === cuit && i.tipo === 'factura_venta' && i.estado !== 'pagado')
                .reduce((acc, curr) => acc + curr.monto_pendiente, 0);
            const pendingAP = invoices.filter(i => i.cuit_entidad === cuit && i.tipo === 'factura_compra' && i.estado !== 'pagado')
                .reduce((acc, curr) => acc + curr.monto_pendiente, 0);

            return { cuit, entidad_nombre, entidad: entidad_nombre, pendingAR, pendingAP, balance: pendingAR - pendingAP };
        });
    }

    static calculateEnterpriseValuation(totalBalance: number, totalAR: number, totalAP: number): number {
        return totalBalance + (totalAR * 0.9) - totalAP;
    }
}
