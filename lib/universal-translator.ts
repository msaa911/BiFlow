
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
        SIRCREB: "30-99903208-3"
    };

    /**
     * Validador Matemático de CUIT (Módulo 11 - AFIP)
     * Distingue dinero real de identificadores fiscales con precisión milimétrica.
     */
    public static isValidCUIT(cuit: string): boolean {
        const clean = cuit.replace(/[^0-9]/g, '');
        if (clean.length !== 11) return false;

        const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        let sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(clean[i]) * factors[i];
        }

        const checkDigit = parseInt(clean[10]);
        let computed = 11 - (sum % 11);
        if (computed === 11) computed = 0;
        if (computed === 10) computed = 9;

        return checkDigit === computed;
    }

    /**
     * Identifica el formato y procesa el archivo
     */
    static translate(rawText: string, options?: { invertSigns?: boolean, thesaurus?: Map<string, string> }): TranslationResult {
        const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length === 0) return { transactions: [], hasExplicitTipo: false, metadata: {} };

        // Escanear las primeras 15 líneas para detectar el formato
        const sampleText = lines.slice(0, 15).join('\n');
        const detectedDelimiter = this.detectDelimiter(sampleText);

        let transactions: Transaction[] = [];
        let hasExplicitTipo = false;

        if (detectedDelimiter) {
            // 1. Carril Rápido: Archivos con Delimitadores (CSV, Pipe, Punto y Coma)
            const result = this.parseDelimited(lines, detectedDelimiter, options?.thesaurus);
            transactions = result.transactions;
            hasExplicitTipo = result.hasExplicitTipo;
        } else {
            // 2. Carril Lento: Archivos de Ancho Fijo (TXTs Bancarios / Interbanking)
            transactions = this.parseFixedWith(lines, options?.thesaurus);
            hasExplicitTipo = false;
        }

        // Inversión de signos manual si se solicita
        if (options?.invertSigns) {
            transactions = transactions.map(t => ({
                ...t,
                monto: -t.monto,
                tipo: t.monto > 0 ? 'DEBITO' : 'CREDITO'
            }));
        }

        return {
            transactions,
            hasExplicitTipo,
            exampleRow: transactions.find(t => t.monto !== 0),
            metadata: this.extractMetadata(lines, transactions)
        };
    }

    /**
     * Detección basada en frecuencia de separadores
     */
    private static detectDelimiter(textSample: string): string | null {
        const candidates = ['|', ';', '\t', ','];
        const lines = textSample.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 5);

        if (lines.length === 0) return null;

        const scores = candidates.map(char => {
            const counts = lines.map(line => line.split(char).length);
            const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
            const isConsistent = counts.every(c => c > 1 && c === counts[0]);
            const max = Math.max(...counts);
            return { char, avg, max, isConsistent };
        });

        // El ganador es el que sea consistente y tenga más columnas
        const best = scores
            .filter(s => s.max > 1)
            .sort((a, b) => {
                if (a.isConsistent && !b.isConsistent) return -1;
                if (!a.isConsistent && b.isConsistent) return 1;
                return b.avg - a.avg;
            })[0];

        return best ? best.char : null;
    }

    /**
     * Parser para Archivos Delimitados (CSV, Pipes)
     */
    private static parseDelimited(lines: string[], delimiter: string, thesaurus?: Map<string, string>): { transactions: Transaction[], hasExplicitTipo: boolean } {
        let headerIdx = -1;
        const keys = ['fecha', 'concepto', 'monto', 'importe', 'cuit', 'tipo', 'descripcion', 'detalle', 'debito', 'credito', 'debe', 'haber'];

        for (let i = 0; i < Math.min(lines.length, 30); i++) {
            const row = lines[i].toLowerCase();
            if (keys.filter(k => row.includes(k)).length >= 2) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) return { transactions: [], hasExplicitTipo: false };

        const headers = lines[headerIdx].split(delimiter).map(h => h.trim().toLowerCase());

        const idx = {
            fecha: headers.findIndex(h => ['fecha', 'fec', 'date'].some(k => h.includes(k))),
            monto: headers.findIndex(h => ['monto', 'importe', 'valor', 'mto', 'total', 'saldo'].some(k => h.includes(k))),
            desc: headers.findIndex(h => ['concepto', 'descripcion', 'detalle', 'desc'].some(k => h.includes(k))),
            cuit: headers.findIndex(h => ['cuit', 'cuil', 'documento'].some(k => h.includes(k))),
            tipo: headers.findIndex(h => ['tipo', 'deb/cre', 'd/c', 'signo', 'movimiento'].some(k => h.includes(k))),
            debito: headers.findIndex(h => ['debito', 'debe', 'egreso', 'salida'].some(k => h.includes(k))),
            credito: headers.findIndex(h => ['credito', 'haber', 'ingreso', 'entrada'].some(k => h.includes(k)))
        };

        const transactions: Transaction[] = [];

        for (const line of lines.slice(headerIdx + 1)) {
            const row = line.split(delimiter).map(v => v.trim());
            if (row.length < 2) continue;

            const fecha = this.normalizeDate(row[idx.fecha]);
            if (!fecha) continue;

            let monto = 0;
            if (idx.debito !== -1 && idx.credito !== -1) {
                const valDeb = this.parseCurrency(row[idx.debito]);
                const valCre = this.parseCurrency(row[idx.credito]);
                monto = valCre - valDeb;
            } else if (idx.monto !== -1) {
                monto = this.parseCurrency(row[idx.monto]);
            }

            // BLINDAJE MATEMÁTICO: Evitar que un CUIT se tome como monto
            const montoRawClean = (idx.monto !== -1 ? (row[idx.monto] || '') : '').replace(/[^0-9]/g, '');
            if (montoRawClean.length === 11 && this.isValidCUIT(montoRawClean)) {
                monto = 0;
            }

            const concepto = this.normalizeConcept(row[idx.desc], thesaurus);
            const cuit = (idx.cuit !== -1 ? row[idx.cuit] : '').replace(/[^0-9]/g, '');

            let tipo: 'DEBITO' | 'CREDITO' = monto < 0 ? 'DEBITO' : 'CREDITO';

            if (idx.tipo !== -1 && row[idx.tipo]) {
                const tr = row[idx.tipo].toUpperCase();
                const isDebit = ['DEB', 'EGRESO', 'D', 'DEBITO', '-', '1', 'BAJA'].some(k => tr.includes(k));
                if (isDebit) {
                    monto = -Math.abs(monto);
                    tipo = 'DEBITO';
                } else {
                    monto = Math.abs(monto);
                    tipo = 'CREDITO';
                }
            }

            if (monto !== 0) {
                transactions.push({
                    fecha,
                    concepto,
                    monto: Math.abs(monto), // El backend espera valor absoluto para procesar según el tipo
                    cuit,
                    tipo,
                    tags: this.isTax(cuit, concepto) ? ['impuesto_recuperable'] : []
                });
            }
        }

        return { transactions, hasExplicitTipo: idx.tipo !== -1 };
    }

    /**
     * Parser para Archivos de Ancho Fijo (TXT) y Detección Automática de Interbanking
     */
    private static parseFixedWith(lines: string[], thesaurus?: Map<string, string>): Transaction[] {
        const transactions: Transaction[] = [];

        for (const line of lines) {
            const trimmed = line.replace(/(\r\n|\n|\r)/gm, "");
            if (trimmed.length < 20 || trimmed.includes('|') || trimmed.includes(';')) continue;

            let fecha = '';
            let concepto = '';
            let monto = 0;
            let cuit = '';
            let tipo: 'DEBITO' | 'CREDITO' = 'DEBITO';

            // DETECCIÓN INTELIGENTE INTERBANKING (Firma: 8 números inicio + D/C fin)
            const lastChar = trimmed.slice(-1).toUpperCase();
            const startsWithDate = /^\d{8}/.test(trimmed);
            const isInterbanking = (lastChar === 'D' || lastChar === 'C') && startsWithDate;

            if (isInterbanking) {
                const rawFecha = trimmed.substring(0, 8);
                fecha = this.normalizeDate(rawFecha) || '';

                const rawMonto = trimmed.slice(-16, -1);
                monto = parseFloat(rawMonto) / 100;

                if (lastChar === 'D') {
                    tipo = 'DEBITO';
                } else {
                    tipo = 'CREDITO';
                }

                const medio = trimmed.slice(8, -16);
                const cuitMatch = medio.match(/\b(20|23|27|30|33|24)[0-9]{9}\b/);
                if (cuitMatch) {
                    cuit = cuitMatch[0];
                    concepto = medio.replace(cuit, '').trim();
                } else {
                    concepto = medio.trim();
                }
            } else {
                // Modo Genérico para otros formatos visuales
                const dateMatch = trimmed.match(/(\d{2}[/-]\d{2}[/-]\d{2,4})/) || trimmed.match(/(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
                const amountMatch = trimmed.match(/(-?[\d\.,]+)$/);

                if (dateMatch && amountMatch) {
                    fecha = this.normalizeDate(dateMatch[0]) || '';
                    monto = this.parseCurrency(amountMatch[0]);
                    tipo = monto < 0 ? 'DEBITO' : 'CREDITO';
                    concepto = trimmed.replace(dateMatch[0], '').replace(amountMatch[0], '').trim();
                }
            }

            if (fecha && monto !== 0) {
                concepto = this.normalizeConcept(concepto, thesaurus);
                if (!cuit) {
                    const cuitMatch = concepto.match(/\b(20|23|27|30|33|24)[0-9]{9}\b/);
                    if (cuitMatch) cuit = cuitMatch[0];
                }

                transactions.push({
                    fecha,
                    concepto,
                    monto: Math.abs(monto),
                    cuit: cuit || '',
                    tipo,
                    tags: this.isTax(cuit, concepto) ? ['impuesto_recuperable'] : []
                });
            }
        }

        return transactions;
    }

    public static normalizeConcept(raw: string, thesaurus?: Map<string, string>): string {
        if (!raw) return 'Sin concepto';
        let clean = raw.trim().toUpperCase()
            .replace(/[0-9]{10,}/g, '')
            .replace(/\b(REF|ID)[:]?\s*[0-9]*/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();

        if (thesaurus) {
            if (thesaurus.has(clean)) return thesaurus.get(clean)!;
            for (const [key, value] of thesaurus.entries()) {
                if (clean.includes(key.toUpperCase())) return value;
            }
        }
        return clean || 'Sin concepto';
    }

    private static normalizeDate(raw: string): string | null {
        if (!raw) return null;
        const clean = raw.replace(/[^\d/.-]/g, '');

        if (/^\d{8}$/.test(clean)) {
            if (clean.startsWith('20')) return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
        }

        const parts = clean.split(/[/-]/).filter(p => p.length > 0);
        if (parts.length === 3) {
            let [p1, p2, p3] = parts;
            if (p1.length === 4) return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
            if (p3.length === 2) p3 = `20${p3}`;
            if (p3.length === 4) return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
        }
        return null;
    }

    private static parseCurrency(str: string): number {
        if (!str) return 0;
        let clean = str.replace(/[^0-9.,-]/g, '');
        const lastComma = clean.lastIndexOf(',');
        const lastDot = clean.lastIndexOf('.');

        if (lastComma > lastDot) clean = clean.replace(/\./g, "").replace(",", ".");
        else if (lastDot > lastComma && lastComma !== -1) clean = clean.replace(/,/g, "");
        else if (lastDot === -1 && lastComma !== -1) clean = clean.replace(",", ".");

        return parseFloat(clean) || 0;
    }

    public static isTax(cuit: string, concepto: string): boolean {
        const cleanCuit = cuit.replace(/-/g, '');
        const taxCuits = Object.values(this.TAX_IDS).map(id => id.replace(/-/g, ''));
        if (taxCuits.includes(cleanCuit)) return true;

        const upper = concepto.toUpperCase();
        return ['SIRCREB', 'IIBB', 'RETENCION', 'IMPUESTO', 'AFIP', 'ARBA', 'PERCEPCION'].some(k => upper.includes(k)) && !upper.includes('IVA');
    }

    private static extractMetadata(lines: string[], transactions: Transaction[]) {
        const headerLines = lines.slice(0, 15).join('\n').toLowerCase();
        let saldoInicial = 0; let saldoFinal = 0;

        const curRegex = (k: string) => new RegExp(`${k}.*?([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})`, 'i');
        const mInit = headerLines.match(curRegex('saldo (?:inicial|anterior)'));
        if (mInit) saldoInicial = this.parseCurrency(mInit[1]);

        const mEnd = headerLines.match(curRegex('saldo (?:final|actual|al)'));
        if (mEnd) saldoFinal = this.parseCurrency(mEnd[1]);

        if (saldoInicial !== 0 || saldoFinal !== 0) {
            const creds = transactions.filter(t => t.tipo === 'CREDITO').reduce((a, b) => a + b.monto, 0);
            const debs = transactions.filter(t => t.tipo === 'DEBITO').reduce((a, b) => a + b.monto, 0);
            const calc = saldoInicial + creds - debs;
            return { saldoInicial, saldoFinal, saldoCalculado: calc, diferencia: Math.abs(saldoFinal - calc), isBalanced: Math.abs(saldoFinal - calc) < 0.05 };
        }
        return {};
    }
}
