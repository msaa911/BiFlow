

// Removed import to avoid lint error as Transaction is defined in file



export interface Transaction {
    fecha: string;
    concepto: string;
    monto: number;
    cuit: string;
    tipo: 'DEBITO' | 'CREDITO';
    tags?: string[];
}


export interface TranslationResult {
    transactions: Transaction[];
    metadata: {
        saldoInicial?: number;
        saldoFinal?: number;
        saldoCalculado?: number;
        diferencia?: number;
        isBalanced?: boolean;
    }
}

export class UniversalTranslator {
    // CUITs oficiales para detección automática de retenciones
    private static TAX_IDS = {
        AFIP: "33-69345023-9",
        ARBA: "30-54674267-9",
        SIRCREB: "30-99903208-3" // Example, needs verification or fuzzy match on "SIRCREB"
    };

    /**
     * Identifica el formato y procesa el archivo
     */
    static translate(rawText: string): TranslationResult {
        const lines = rawText.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return { transactions: [], metadata: {} };

        const firstLine = lines[0];
        let transactions: Transaction[] = [];

        // 1. Detección de Formato Posicional (Fixed-width)
        if (!firstLine.includes(',') && !firstLine.includes(';') && !firstLine.includes('|')) {
            transactions = this.parseFixedWith(lines);
        } else {
            // 2. Detección de Delimitadores (CSV/ERP/Pipe)
            const delimiter = this.detectDelimiter(firstLine);
            transactions = this.parseDelimited(lines, delimiter);
        }

        // 3. Metadata Extraction (Header Analysis for Balance)
        const metadata = this.extractMetadata(lines, transactions);

        return { transactions, metadata };
    }

    private static extractMetadata(lines: string[], transactions: Transaction[]) {
        const headerLines = lines.slice(0, 15).join('\n').toLowerCase();

        let saldoInicial = 0;
        let saldoFinal = 0;

        const currencyRegex = (key: string) => new RegExp(`${key}.*?([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})`, 'i');

        const matchInicial = headerLines.match(currencyRegex('saldo (?:inicial|anterior)'));
        if (matchInicial) {
            saldoInicial = this.parseCurrency(matchInicial[1]);
        }

        const matchFinal = headerLines.match(currencyRegex('saldo (?:final|actual|al)'));
        if (matchFinal) {
            saldoFinal = this.parseCurrency(matchFinal[1]);
        }

        if (saldoInicial !== 0 || saldoFinal !== 0) {
            const totalCreditos = transactions.filter(t => t.tipo === 'CREDITO').reduce((sum, t) => sum + t.monto, 0);
            const totalDebitos = transactions.filter(t => t.tipo === 'DEBITO').reduce((sum, t) => sum + t.monto, 0);

            const saldoCalculado = saldoInicial + totalCreditos - totalDebitos;
            const diferencia = Math.abs(saldoFinal - saldoCalculado);
            const isBalanced = diferencia < 0.05;

            return {
                saldoInicial,
                saldoFinal,
                saldoCalculado,
                diferencia,
                isBalanced
            };
        }

        return {};
    }

    private static parseCurrency(str: string): number {
        let clean = str.replace(/[^0-9.,-]/g, '');
        if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            clean = clean.replace(/,/g, '');
        }
        return parseFloat(clean);
    }

    private static detectDelimiter(line: string): string {
        if (line.includes(';')) return ';';
        if (line.includes('|')) return '|';
        return ',';
    }

    private static parseFixedWith(lines: string[]): Transaction[] {
        return lines.map(line => {
            const trimmed = line.replace(/(\r\n|\n|\r)/gm, "")
            if (trimmed.length < 20) return null

            let fecha = ''
            let concepto = ''
            let monto = 0
            let cuit = ''

            const dateMatch = trimmed.match(/(?:01)?(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/)
            if (dateMatch) {
                fecha = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
            }

            const amountMatch = trimmed.match(/(-?[\d\.,]+)$/)
            if (amountMatch) {
                const raw = amountMatch[1]
                if (!raw.includes('.') && !raw.includes(',') && raw.length > 15) {
                    const blocks = trimmed.split(/[^0-9]+/)
                    const amountBlock = blocks.find(b => b.length >= 10 && b.length <= 14 && !b.startsWith('202'))
                    if (amountBlock) {
                        monto = parseFloat(amountBlock) / 100
                    }
                } else {
                    monto = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
                }
            }

            if (fecha && monto !== 0) {
                concepto = trimmed.substring(18, 50).replace(/[0-9]{10,}/g, '').trim()
                const cuitMatch = trimmed.match(/\b(20|23|27|30|33|24)[0-9]{9}\b/)
                if (cuitMatch) cuit = cuitMatch[0]
            }

            if (!fecha || monto === 0) return null

            // Tax Tagging
            let tags: string[] = []
            if (this.isTax(cuit, concepto)) {
                tags.push('impuesto_recuperable')
            }

            return {
                fecha,
                concepto: concepto || 'Sin concepto',
                monto: Math.abs(monto),
                cuit: cuit || '',
                tipo: 'DEBITO',
                tags
            }
        }).filter((t) => t !== null) as Transaction[]
    }

    private static isTax(cuit: string, concepto: string): boolean {
        // Check exact CUITs
        const cleanCuit = cuit.replace(/-/g, '')
        const taxCuits = Object.values(this.TAX_IDS).map(id => id.replace(/-/g, ''))
        if (taxCuits.includes(cleanCuit)) return true

        // Check Keywords
        const upperConcept = concepto.toUpperCase()
        const taxKeywords = ['SIRCREB', 'IIBB', 'IMP.LEY', 'RETENCION', 'IMPUESTO', 'AGIP', 'ARBA', 'AFIP']
        return taxKeywords.some(k => upperConcept.includes(k)) && !upperConcept.includes('IVA') // Exclude IVA usually
    }

    private static parseDelimited(lines: string[], delimiter: string): Transaction[] {
        if (lines.length < 2) return []

        const headers = lines[0].toLowerCase().split(delimiter).map(h => h.trim().replace(/^"/, '').replace(/"$/, ''))

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
                // Use the robust currency parser that handles both 1.000,00 and 1,000.00
                monto = UniversalTranslator.parseCurrency(montoStr)
            }

            if (!fecha || isNaN(monto)) return null

            let tipoStr = findCol(row, ['tipo', 'type', 'movimiento', 'category']) || ''

            // Logic to determine sign based on Type or Amount string
            if (monto !== 0) {
                const cleanTipo = tipoStr.toUpperCase()

                // 1. Explicit Type Column (Priority: Source of Truth)
                // If a type column exists, we force the sign based on it.
                if (cleanTipo) {
                    // FIX: Strict check for short aliases
                    const isExplicitNegative = ['DEBITO', 'DEBIT', 'EGRESO', 'OUT', 'GASTO', 'PAGO'].some(t => cleanTipo.includes(t)) || cleanTipo === 'D'
                    const isExplicitPositive = ['CREDITO', 'CREDIT', 'INGRESO', 'IN', 'COBRO', 'DEPOSITO'].some(t => cleanTipo.includes(t)) || cleanTipo === 'C'

                    if (isExplicitNegative) {
                        monto = -Math.abs(monto)
                    }
                    else if (isExplicitPositive) {
                        monto = Math.abs(monto)
                    }
                }
                // 2. No Type Column -> Trust the Amount Sign
                // If the parser read a negative number, it's a Debit. If positive, it's a Credit.
                // We do NOT guess based on description keywords.
            }

            // Tax Tagging
            let tags: string[] = []
            if (this.isTax(cuit, concepto)) {
                tags.push('impuesto_recuperable')
            }

            return {
                fecha,
                concepto,
                monto: monto, // Signed amount
                cuit,
                tipo: monto < 0 ? 'DEBITO' : 'CREDITO',
                tags
            }
        }).filter((t) => t !== null) as Transaction[]
    }
}
