

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
    hasExplicitTipo: boolean;
    exampleRow?: Transaction;
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
    static translate(rawText: string, options?: { invertSigns?: boolean }): TranslationResult {
        const lines = rawText.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return { transactions: [], hasExplicitTipo: false, metadata: {} };

        const firstLine = lines[0];
        let transactions: Transaction[] = [];
        let hasExplicitTipo = false;

        // 1. Detección de Formato Posicional (Fixed-width)
        if (!firstLine.includes(',') && !firstLine.includes(';') && !firstLine.includes('|')) {
            transactions = this.parseFixedWith(lines);
            hasExplicitTipo = false; // Fixed width usually doesn't have headers
        } else {
            // 2. Detección de Delimitadores (CSV/ERP/Pipe)
            const delimiter = this.detectDelimiter(firstLine);
            const result = this.parseDelimited(lines, delimiter);
            transactions = result.transactions;
            hasExplicitTipo = result.hasExplicitTipo;
        }

        // Apply manual sign inversion if requested (Priority 2 Logic)
        if (options?.invertSigns) {
            transactions = transactions.map(t => ({ ...t, monto: -t.monto, tipo: t.monto > 0 ? 'DEBITO' : 'CREDITO' }));
        }

        const exampleRow = transactions.find(t => t.monto !== 0);

        // 3. Metadata Extraction (Header Analysis for Balance)
        const metadata = this.extractMetadata(lines, transactions);

        return { transactions, hasExplicitTipo, exampleRow, metadata };
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
                    } else {
                        // Fallback: Check for VERY long blocks (Amount + CUIT concatenated)
                        // Example: 000000126318309276273170000000000
                        const longBlock = blocks.find(b => b.length > 18)
                        if (longBlock) {
                            // Try to find a CUIT inside: 20/23/24/27/30/33 + 9 digits
                            const cuitMatch = longBlock.match(/(20|23|24|27|30|33)[0-9]{9}/)
                            if (cuitMatch) {
                                const cuitFound = cuitMatch[0]
                                const cuitIndex = longBlock.indexOf(cuitFound)

                                // Assume everything BEFORE the CUIT is the Amount
                                // (ignoring leading zeros which parseFloat handles)
                                const amountPart = longBlock.substring(0, cuitIndex)

                                if (amountPart.length > 0) {
                                    monto = parseFloat(amountPart) / 100
                                    cuit = cuitFound // Extract valid CUIT
                                }
                            }
                        }
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

    private static parseDelimited(lines: string[], delimiter: string): { transactions: Transaction[], hasExplicitTipo: boolean } {
        if (lines.length < 2) return { transactions: [], hasExplicitTipo: false }

        // 1. Ghost Header Scanner: Find the real header row
        let headerRowIndex = 0;
        const keywords = ['fecha', 'date', 'fec', 'concepto', 'descripcion', 'monto', 'importe', 'referencia'];

        for (let i = 0; i < Math.min(lines.length, 20); i++) {
            const row = lines[i].toLowerCase();
            const matchCount = keywords.filter(k => row.includes(k)).length;
            if (matchCount >= 2) { // At least 2 financial keywords found
                headerRowIndex = i;
                break;
            }
        }

        const headers = lines[headerRowIndex].toLowerCase().split(delimiter).map(h => h.trim().replace(/^"/, '').replace(/"$/, ''))
        let hasExplicitTipo = false;

        const findColIndex = (aliases: string[]) => {
            for (const alias of aliases) {
                const idx = headers.findIndex(h => h.includes(alias))
                if (idx !== -1) return idx
            }
            return -1
        }

        const findCol = (row: string[], idx: number) => {
            if (idx !== -1 && row[idx]) return row[idx].trim().replace(/^"/, '').replace(/"$/, '')
            return ''
        }

        // 2. Formatting Detection (Separator Probability)
        const debitColIdx = findColIndex(['debe', 'debito', 'debit', 'egreso']);
        const creditColIdx = findColIndex(['haber', 'credito', 'credit', 'ingreso']);
        let amountColIdx = findColIndex(['monto', 'importe', 'valor', 'saldo']);

        let useSeparateCols = false;
        if (debitColIdx !== -1 && creditColIdx !== -1) {
            useSeparateCols = true;
        } else if (amountColIdx === -1) {
            if (debitColIdx !== -1) amountColIdx = debitColIdx;
            else if (creditColIdx !== -1) amountColIdx = creditColIdx;
        }

        const colResultIdx = useSeparateCols ? debitColIdx : amountColIdx;
        let decimalSeparator = '.'; // Default

        if (colResultIdx !== -1) {
            // Analizar las primeras 20 filas de datos para determinar el formato
            const samples = lines.slice(headerRowIndex + 1, headerRowIndex + 21)
                .map(l => l.split(delimiter)[colResultIdx])
                .filter(val => val && /[0-9]/.test(val));

            if (samples.length > 0) {
                let dotScore = 0;
                let commaScore = 0;

                samples.forEach(s => {
                    const lastDot = s.lastIndexOf('.');
                    const lastComma = s.lastIndexOf(',');
                    if (lastComma > lastDot) commaScore++; // 1.000,00
                    else if (lastDot > lastComma) dotScore++; // 1,000.00
                });

                if (commaScore > dotScore) decimalSeparator = ',';
            }
        }

        // Peek to see if 'tipo' column exists in headers
        hasExplicitTipo = headers.some(h => ['tipo', 'type', 'movimiento', 'category'].some(a => h.includes(a)));

        const transactions = lines.slice(headerRowIndex + 1).map(line => {
            // 4. Noise Filter: Ignore TOTAL/SALDO rows
            const upperLine = line.toUpperCase();
            if ((upperLine.includes('TOTAL') || upperLine.includes('SALDO')) && !upperLine.match(/[0-9]{2}[\/-][0-9]{2}/)) {
                return null;
            }

            const row = line.split(delimiter)
            if (row.length < 2) return null

            let fecha = findCol(row, findColIndex(['fecha', 'date', 'fec']))
            const concepto = findCol(row, findColIndex(['concepto', 'detalle', 'descripcion', 'razon', 'referencia'])) || 'Sin concepto'
            let cuit = findCol(row, findColIndex(['cuit', 'cuil', 'id', 'tax'])) || ''

            if (fecha) {
                const parts = fecha.split(/[\/-]/)
                if (parts.length === 3) {
                    if (parts[2].length === 4) fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                    else if (parts[0].length === 4) fecha = `${parts[0]}-${parts[1]}-${parts[2]}`
                }
            }

            let monto = 0;
            const parseWithFormat = (str: string) => {
                let clean = str.replace(/[^0-9.,-]/g, '');
                if (decimalSeparator === ',') {
                    clean = clean.replace(/\./g, '').replace(',', '.');
                } else {
                    clean = clean.replace(/,/g, '');
                }
                return parseFloat(clean);
            }

            if (useSeparateCols) {
                const debitStr = findCol(row, debitColIdx);
                const creditStr = findCol(row, creditColIdx);
                const debitVal = debitStr ? Math.abs(parseWithFormat(debitStr)) : 0;
                const creditVal = creditStr ? Math.abs(parseWithFormat(creditStr)) : 0;

                monto = creditVal - debitVal;
            } else {
                let montoStr = findCol(row, amountColIdx);
                if (montoStr) {
                    monto = parseWithFormat(montoStr);
                } else {
                    monto = NaN; // Invalid amount
                }
            }

            // 3. Remote CUIT Extraction
            if (!cuit) {
                // Regex for CUIT inside text: 20-12345678-9 or 20123456789
                const cuitMatch = concepto.match(/\b(20|23|27|30|33|24)[-]?\d{8}[-]?\d{1}\b/);
                if (cuitMatch) {
                    cuit = cuitMatch[0].replace(/-/g, '');
                }
            }

            if (!fecha || isNaN(monto)) return null

            let tipoStr = findCol(row, findColIndex(['tipo', 'type', 'movimiento', 'category'])) || ''

            // Logic to determine sign based on Type or Amount string
            if (monto !== 0) {
                const cleanTipo = tipoStr.toUpperCase()

                // 1. Explicit Type Column (Priority: Source of Truth)
                if (cleanTipo) {
                    const isExplicitNegative = cleanTipo.includes('DEBITO') || cleanTipo === 'D'
                    const isExplicitPositive = cleanTipo.includes('CREDITO') || cleanTipo === 'C'

                    if (isExplicitNegative) {
                        monto = -Math.abs(monto)
                    }
                    else if (isExplicitPositive) {
                        monto = Math.abs(monto)
                    }
                }
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

        return { transactions, hasExplicitTipo };
    }
}
