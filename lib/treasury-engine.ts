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
    tags?: string[];
}

export interface ProjectedMovement {
    id: string;
    descripcion: string;
    monto: number;
    fecha: string;
    isProjected: boolean;
    categoria?: string;
}

export interface DailyBalance {
    date: string;
    balance: number;
    balanceWithChecks?: number;
    isProjected: boolean;
    isAlert?: boolean;
}

export interface MonthlyCashFlowRow {
    label: string;
    category: 'resumen' | 'operativo' | 'inversion' | 'financiero';
    isTotal?: boolean;
    values: number[]; // Index maps to months array
}

export interface MonthlyCashFlowData {
    months: string[]; // ['2024-01', '2024-02', ...]
    rows: MonthlyCashFlowRow[];
}

export class TreasuryEngine {
    static INFLATION_FACTOR = 1.08;

    /**
     * Projects daily balance for a specific horizon (30, 60, 90 days)
     */
    static projectDailyBalance(
        currentBalance: number,
        invoices: Invoice[],
        projects: ProjectedMovement[],
        liquidityBuffer: number = 0,
        horizonDays: number = 30
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
        const pastDueMovements = movements.filter(m => new Date(m.fecha) < today && m.fecha !== today.toISOString().split('T')[0]);
        pastDueMovements.forEach(m => runningBalance += m.monto);

        const futureMovements = movements.filter(m => new Date(m.fecha) >= today || m.fecha === today.toISOString().split('T')[0]);

        for (let i = 0; i < horizonDays; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];

            const dateMovements = futureMovements.filter(m => m.fecha === dateStr);
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
     * Generates a monthly cash flow grid similar to the Excel reference.
     */
    static getMonthlyCashFlow(
        currentBalance: number,
        invoices: Invoice[],
        transactions: any[],
        projects: ProjectedMovement[]
    ): MonthlyCashFlowData {
        const now = new Date();
        const months: string[] = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            months.push(d.toISOString().substring(0, 7));
        }

        const data: MonthlyCashFlowData = {
            months,
            rows: [
                { label: 'Saldo Inicial', category: 'resumen', values: Array(12).fill(0) },
                { label: 'Suma de cobros (+)', category: 'resumen', values: Array(12).fill(0) },
                { label: 'Suma de pagos (-)', category: 'resumen', values: Array(12).fill(0) },
                { label: 'Flujo de caja neto (=)', category: 'resumen', isTotal: true, values: Array(12).fill(0) },
                { label: 'Saldo Final (=)', category: 'resumen', isTotal: true, values: Array(12).fill(0) },

                { label: 'Ventas al Contado/Plazo', category: 'operativo', values: Array(12).fill(0) },
                { label: 'Pagos a Proveedores', category: 'operativo', values: Array(12).fill(0) },
                { label: 'Pagos de Nóminas y Cargas', category: 'operativo', values: Array(12).fill(0) },
                { label: 'Pagos de Impuestos y Tasas', category: 'operativo', values: Array(12).fill(0) },
                { label: 'Pagos de Servicios Públicos', category: 'operativo', values: Array(12).fill(0) },
                { label: 'Pagos de Arrendamientos', category: 'operativo', values: Array(12).fill(0) },
                { label: 'Liquidación de IVA (Est.)', category: 'operativo', values: Array(12).fill(0) },

                { label: 'Compras Activos Fijos', category: 'inversion', values: Array(12).fill(0) },
                { label: 'Ventas Activos Fijos', category: 'inversion', values: Array(12).fill(0) },

                { label: 'Intereses Pagados/Cobrados', category: 'financiero', values: Array(12).fill(0) },
                { label: 'Préstamos Recibidos/Pagados', category: 'financiero', values: Array(12).fill(0) },
                { label: 'Dividendos', category: 'financiero', values: Array(12).fill(0) }
            ]
        };

        const getRow = (label: string) => data.rows.find(r => r.label === label);

        // Helper to get month index
        const getMonthIdx = (dateStr: string) => months.indexOf(dateStr.substring(0, 7));

        // 1. Process Invoices (Operating AR/AP)
        invoices.filter(i => i.estado !== 'pagado').forEach(inv => {
            const idx = getMonthIdx(inv.fecha_vencimiento);
            if (idx === -1) return;

            if (inv.tipo === 'factura_venta') {
                getRow('Ventas al Contado/Plazo')!.values[idx] += inv.monto_pendiente;
                getRow('Suma de cobros (+)')!.values[idx] += inv.monto_pendiente;

                // IVA Estimation for settlement (next month)
                if (idx < 11) {
                    const iva = (inv.monto_pendiente / 1.21) * 0.21;
                    getRow('Liquidación de IVA (Est.)')!.values[idx + 1] -= iva;
                }
            } else if (inv.tipo === 'factura_compra') {
                getRow('Pagos a Proveedores')!.values[idx] += inv.monto_pendiente;
                getRow('Suma de pagos (-)')!.values[idx] += inv.monto_pendiente;

                // IVA Estimation for settlement (next month)
                if (idx < 11) {
                    const iva = (inv.monto_pendiente / 1.21) * 0.21;
                    getRow('Liquidación de IVA (Est.)')!.values[idx + 1] += iva;
                }
            }
        });

        // 2. Process Projected Movements
        projects.forEach(p => {
            const idx = getMonthIdx(p.fecha);
            if (idx === -1) return;

            const targetLabel = p.categoria || (p.monto > 0 ? 'Ventas al Contado/Plazo' : 'Pagos a Proveedores');
            const row = getRow(targetLabel);
            if (row) {
                row.values[idx] += p.monto;
                if (p.monto > 0) getRow('Suma de cobros (+)')!.values[idx] += p.monto;
                else getRow('Suma de pagos (-)')!.values[idx] += Math.abs(p.monto);
            }
        });

        // 3. Chain Balances
        let runningBalance = currentBalance;
        for (let i = 0; i < 12; i++) {
            getRow('Saldo Inicial')!.values[i] = runningBalance;

            const net = getRow('Suma de cobros (+)')!.values[i] - getRow('Suma de pagos (-)')!.values[i];
            getRow('Flujo de caja neto (=)')!.values[i] = net;

            runningBalance += net;
            getRow('Saldo Final (=)')!.values[i] = runningBalance;
        }

        return data;
    }

    static calculateAdjustedMonto(amount: number): number {
        return amount * this.INFLATION_FACTOR;
    }

    static calculateInflationLoss(amount: number): number {
        return amount * (this.INFLATION_FACTOR - 1);
    }

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

    static detectNettingOpportunities(invoices: Invoice[]): any[] {
        const salesEntidades = new Set(invoices.filter(i => i.tipo === 'factura_venta').map(i => i.cuit_entidad || i.cuit_socio));
        const purchaseEntidades = new Set(invoices.filter(i => i.tipo === 'factura_compra').map(i => i.cuit_entidad || i.cuit_socio));

        const intersections = [...salesEntidades].filter(cuit => purchaseEntidades.has(cuit));

        return intersections.map(cuit => {
            const matchingInv = invoices.find(i => (i.cuit_entidad || i.cuit_socio) === cuit);
            const entidad_nombre = matchingInv?.razon_social_entidad || matchingInv?.razon_social_socio;
            const pendingAR = invoices.filter(i => (i.cuit_entidad || i.cuit_socio) === cuit && i.tipo === 'factura_venta' && i.estado !== 'pagado')
                .reduce((acc, curr) => acc + curr.monto_pendiente, 0);
            const pendingAP = invoices.filter(i => (i.cuit_entidad || i.cuit_socio) === cuit && i.tipo === 'factura_compra' && i.estado !== 'pagado')
                .reduce((acc, curr) => acc + curr.monto_pendiente, 0);

            return { cuit, entidad_nombre, entidad: entidad_nombre, pendingAR, pendingAP, balance: pendingAR - pendingAP };
        });
    }

    static calculateEnterpriseValuation(totalBalance: number, totalAR: number, totalAP: number): number {
        return totalBalance + (totalAR * 0.9) - totalAP;
    }
}
