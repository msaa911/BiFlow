
// Mock Transaction Interface
interface Transaction {
    fecha: string;
    concepto: string;
    monto: number;
    cuit: string;
    tipo: 'DEBITO' | 'CREDITO';
    tags?: string[];
}

class UniversalTranslator {
    static TAX_IDS = {
        AFIP: "33-69345023-9",
        ARBA: "30-54674267-9",
        SIRCREB: "30-99903208-3"
    };

    static parseCurrency(str: string): number {
        let clean = str.replace(/[^0-9.,-]/g, '');
        if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            clean = clean.replace(/,/g, '');
        }
        return parseFloat(clean);
    }

    private static isTax(cuit: string, concepto: string): boolean {
        const cleanCuit = cuit.replace(/-/g, '')
        const taxCuits = Object.values(this.TAX_IDS).map(id => id.replace(/-/g, ''))
        if (taxCuits.includes(cleanCuit)) return true
        const upperConcept = concepto.toUpperCase()
        const taxKeywords = ['SIRCREB', 'IIBB', 'IMP.LEY', 'RETENCION', 'IMPUESTO', 'AGIP', 'ARBA', 'AFIP']
        return taxKeywords.some(k => upperConcept.includes(k)) && !upperConcept.includes('IVA')
    }

    static translate(rawText: string) {
        const lines = rawText.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return { transactions: [] };

        const firstLine = lines[0];
        const delimiter = this.detectDelimiter(firstLine);
        return { transactions: this.parseDelimited(lines, delimiter) };
    }

    private static detectDelimiter(line: string): string {
        if (line.includes(';')) return ';';
        if (line.includes('|')) return '|';
        return ',';
    }

    private static parseDelimited(lines: string[], delimiter: string): Transaction[] {
        if (lines.length < 2) return []

        const headers = lines[0].toLowerCase().split(delimiter).map(h => h.trim().replace(/^"/, '').replace(/"$/, ''))
        console.log('Headers:', headers)

        const findCol = (row: string[], aliases: string[]) => {
            const idx = headers.findIndex(h => aliases.some(a => h.includes(a)))
            if (idx !== -1 && row[idx]) return row[idx].trim().replace(/^"/, '').replace(/"$/, '')
            return ''
        }

        return lines.slice(1).map(line => {
            const row = line.split(delimiter)
            if (row.length < 2) return null

            let fecha = findCol(row, ['fecha', 'date', 'fec'])
            const concepto = findCol(row, ['concepto', 'detalle', 'descripcion', 'razon', 'referencia']) || 'Sin concepto'
            let montoStr = findCol(row, ['monto', 'importe', 'valor', 'debe', 'haber', 'saldo'])
            const cuit = findCol(row, ['cuit', 'cuil', 'id', 'tax']) || ''

            if (fecha) {
                const parts = fecha.split(/[\/-]/)
                if (parts.length === 3) {
                    if (parts[2].length === 4) fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                    else if (parts[0].length === 4) fecha = `${parts[0]}-${parts[1]}-${parts[2]}`
                }
            }

            let monto = 0
            if (montoStr) {
                monto = this.parseCurrency(montoStr)
            }

            if (!fecha || isNaN(monto)) return null

            let tipoStr = findCol(row, ['tipo', 'type', 'movimiento', 'category']) || ''
            console.log(`Row: ${concepto} | TipoStr: "${tipoStr}" | MontoRaw: ${monto}`)

            if (monto !== 0) {
                const cleanTipo = tipoStr.toUpperCase()
                const cleanDesc = concepto.toUpperCase()

                // 1. Explicit Type Check
                if (['DEBITO', 'DEBIT', 'EGRESO', 'OUT', 'GASTO', 'PAGO', 'D'].some(t => cleanTipo === t || cleanTipo.includes(t))) {
                    console.log('-> Matched Explicit NEGATIVE')
                    monto = -Math.abs(monto)
                }
                else if (['CREDITO', 'CREDIT', 'INGRESO', 'IN', 'COBRO', 'DEPOSITO', 'C'].some(t => cleanTipo === t || cleanTipo.includes(t))) {
                    console.log('-> Matched Explicit POSITIVE')
                    monto = Math.abs(monto)
                }
                // 2. Contextual Check
                else {
                    const negativeOverride = ['NOTA DE DEBITO', 'ND ', 'IMPUESTO LEY', 'IMP.LEY', 'IIBB', 'COMISION', 'GASTO', 'SELLOS', 'IVA', 'RETENCION', 'PERCEPCION', 'SUSS']
                    const positiveKeywords = ['NOTA DE CREDITO', 'NC ', 'DEVOLUCION', 'RECUPERO', 'INGRESO', 'COBRO', 'DEPOSITO', 'TRANSFERENCIA RECIBIDA', 'ACREDITAMIENTO', 'VENTA', 'CREDITO']

                    if (negativeOverride.some(k => cleanDesc.includes(k))) {
                        console.log('-> Matched Context NEGATIVE')
                        monto = -Math.abs(monto)
                    }
                    else if (positiveKeywords.some(k => cleanDesc.includes(k))) {
                        console.log('-> Matched Context POSITIVE')
                        monto = Math.abs(monto)
                    }
                    else {
                        console.log('-> Default NEGATIVE')
                        monto = -Math.abs(monto)
                    }
                }
            }

            let tags: string[] = []
            if (this.isTax(cuit, concepto)) {
                tags.push('impuesto_recuperable')
            }

            return {
                fecha,
                concepto,
                monto,
                cuit,
                tipo: monto < 0 ? 'DEBITO' : 'CREDITO',
                tags
            }
        }).filter((t) => t !== null) as Transaction[]
    }
}

// Test with User Data
const csvData = `Fecha;Concepto;CUIT;Importe;Tipo
30/06/2026;VENTA EXTRAORDINARIA;30999222333;1200000.00;CREDITO
27/06/2026;AFIP RETENCION;33693450239;3800.00;DEBITO
29/06/2026;PAGO METROGAS;30500001520;26000.00;DEBITO`;

const result = UniversalTranslator.translate(csvData);
console.log(JSON.stringify(result, null, 2));
