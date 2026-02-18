
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
    private static TAX_IDS = {
        AFIP: "33-69345023-9",
        ARBA: "30-54674267-9",
        SIRCREB: "30-99903208-3"
    };

    /**
     * Identificación y proceso del archivo
     */
    static translate(rawText: string, options?: { invertSigns?: boolean, thesaurus?: Map<string, string> }): TranslationResult {
        const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length === 0) return { transactions: [], hasExplicitTipo: false, metadata: {} };

        // CORRECCIÓN: Escanear las primeras 10 líneas para detectar el formato (o todo el archivo si es corto)
        const sampleText = lines.slice(0, 10).join('\n');
        const detectedDelimiter = this.detectDelimiter(sampleText);

        let transactions: Transaction[] = [];
        let hasExplicitTipo = false;

        if (detectedDelimiter) {
            const result = this.parseDelimited(lines, detectedDelimiter, options?.thesaurus);
            transactions = result.transactions;
            hasExplicitTipo = result.hasExplicitTipo;
        } else {
            // Detección de Interbanking (Record Type 01 al inicio de la línea)
            const isInterbanking = lines[0].startsWith('01') || lines.some(l => l.startsWith('01'));

            if (isInterbanking) {
                // Preset Interbanking Estándar
                const rules = {
                    fecha: { start: 0, end: 8 },
                    cuit: { start: 30, end: 41 },
                    descripcion: { start: 41, end: 93 },
                    monto: { start: 93, end: 105 }
                };
                const { parseFixed } = require('./parsers/fixed-width');
                const result = parseFixed(rawText, rules, { thesaurus: options?.thesaurus });
                transactions = result.transactions;
            } else {
                // Fallback inteligente para otros Anchos Fijos
                transactions = this.parseFixedWith(lines, options?.thesaurus);
            }
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
     * Detección basada en frecuencia (Umbral: Al menos 0.5 delimitadores por línea promedio)
     */
    private static detectDelimiter(textSample: string): string | null {
        // Ignorar líneas vacías o muy cortas para el análisis de frecuencia
        const lines = textSample.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 10)
            .slice(0, 15);

        if (lines.length === 0) return null;

        const candidates = ['|', ';', '\t', ','];
        const scores = candidates.map(char => {
            const counts = lines.map(line => line.split(char).length);
            const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
            // Medimos consistencia: si todas las líneas tienen la misma cantidad de separadores
            const isConsistent = counts.every(c => c > 1 && c === counts[0]);
            const max = Math.max(...counts);
            return { char, avg, max, isConsistent };
        });

        // Prioridad: 
        // 1. Delimitadores consistentes (misma cantidad de columnas en todas las líneas de muestra)
        // 2. Delimitadores con mayor número de columnas (> 1)
        const best = scores
            .filter(s => s.max > 1)
            .sort((a, b) => {
                if (a.isConsistent && !b.isConsistent) return -1;
                if (!a.isConsistent && b.isConsistent) return 1;
                return b.avg - a.avg;
            })[0];

        return best ? best.char : null;
    }

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

        if (headerIdx === -1) return this.parseNoHeader(lines, delimiter, thesaurus);

        const headers = lines[headerIdx].split(delimiter).map(h => h.trim().toLowerCase());
        const idx = {
            fecha: headers.findIndex(h => ['fecha', 'fec', 'date'].some(k => h.includes(k))),
            monto: headers.findIndex(h => ['monto', 'importe', 'valor', 'mto', 'total'].some(k => h.includes(k))),
            desc: headers.findIndex(h => ['concepto', 'descripcion', 'detalle', 'desc'].some(k => h.includes(k))),
            cuit: headers.findIndex(h => ['cuit', 'cuil', 'documento'].some(k => h.includes(k))),
            tipo: headers.findIndex(h => ['tipo', 'deb/cre', 'd/c', 'signo'].some(k => h.includes(k))),
            debito: headers.findIndex(h => ['debito', 'debe', 'egreso', 'salida'].some(k => h.includes(k))),
            credito: headers.findIndex(h => ['credito', 'haber', 'ingreso', 'entrada'].some(k => h.includes(k)))
        };

        const transactions: Transaction[] = [];
        for (const line of lines.slice(headerIdx + 1)) {
            const row = line.split(delimiter).map(v => v.trim());
            if (row.length < 2) continue;

            const fecha = this.normalizeDate(row[idx.fecha]);
            if (!fecha) continue;

            let monto = idx.monto !== -1 ? this.parseCurrency(row[idx.monto]) : 0;

            // Lógica de Doble Columna (Débito/Crédito)
            if (monto === 0) {
                const valDeb = idx.debito !== -1 ? this.parseCurrency(row[idx.debito]) : 0;
                const valCre = idx.credito !== -1 ? this.parseCurrency(row[idx.credito]) : 0;

                if (valDeb !== 0) {
                    monto = -Math.abs(valDeb);
                } else if (valCre !== 0) {
                    monto = Math.abs(valCre);
                }
            }

            // CUIT TRAP: Si el monto tiene 11 dígitos y es un CUIT válido matemáticamente, no es el monto
            const montoRawClean = (idx.monto !== -1 ? (row[idx.monto] || '') : '').replace(/[^0-9]/g, '');
            if (montoRawClean.length === 11 && this.isValidCUIT(montoRawClean)) {
                monto = 0; // Es un CUIT, no plata.
            }
            // Eliminamos la regla de > 100M para permitir pagos grandes legítimos.

            const concepto = this.normalizeConcept(row[idx.desc], thesaurus);
            const cuit = (idx.cuit !== -1 ? row[idx.cuit] : '').replace(/[^0-9]/g, '');

            // Sign Logic
            let tipo: 'DEBITO' | 'CREDITO' = monto < 0 ? 'DEBITO' : 'CREDITO';
            if (idx.tipo !== -1 && row[idx.tipo]) {
                const tr = row[idx.tipo].toUpperCase();
                const isDebit = ['DEB', 'EGRESO', 'D', 'DEBITO', '-', '1', 'BAJA', 'GASTO'].some(k => tr.includes(k));
                if (isDebit) {
                    monto = -Math.abs(monto);
                    tipo = 'DEBITO';
                } else {
                    monto = Math.abs(monto);
                    tipo = 'CREDITO';
                }
            }

            if (monto !== 0) {
                const tags = this.isTax(cuit, concepto) ? ['impuesto_recuperable'] : [];
                if (['COMISION', 'MANTENIMIENTO', 'CUOTA', 'CARGO'].some(k => concepto.includes(k))) {
                    if (concepto.includes('MANT')) tags.push('mantenimiento');
                    else tags.push('comision_bancaria');
                }
                transactions.push({ fecha, concepto, monto, cuit, tipo, tags });
            }
        }

        return { transactions, hasExplicitTipo: idx.tipo !== -1 };
    }

    private static parseNoHeader(lines: string[], delimiter: string, thesaurus?: Map<string, string>): { transactions: Transaction[], hasExplicitTipo: boolean } {
        const transactions: Transaction[] = [];
        let detectedTipoIdx = -1;

        for (const line of lines) {
            const row = line.split(delimiter).map(v => v.trim());
            if (row.length < 2) continue;

            // 1. Encontrar Fecha (Indispensable)
            const dateIdx = row.findIndex(v => this.normalizeDate(v) !== null);
            if (dateIdx === -1) continue;
            const fecha = this.normalizeDate(row[dateIdx])!;

            // 2. detectar columna de Tipo (solo si no la teníamos)
            if (detectedTipoIdx === -1) {
                detectedTipoIdx = row.findIndex(v => ['DEBITO', 'CREDITO', 'DEB', 'CRE', 'EGRESO', 'INGRESO'].some(k => v.toUpperCase().includes(k)));
            }

            // 3. Encontrar Monto (evitando la columna de la fecha y tipo)
            const amountCandidates = row.map((v, i) => {
                const cleaned = v.replace(/[^0-9]/g, '');
                const isCuit = this.isValidCUIT(cleaned);
                return {
                    v: this.parseCurrency(v),
                    raw: cleaned,
                    isLikelyCuit: isCuit, // Solo descartamos si es un CUIT matemático exacto
                    idx: i
                };
            }).filter(c =>
                c.idx !== dateIdx &&
                c.v !== 0 &&
                !c.isLikelyCuit && // BLOQUEO MATEMÁTICO DE CUITS
                // Eliminamos cualquier umbral arbitrario. Confiamos en el CUIT trap.
                !row[dateIdx].includes(c.raw)
            );

            // Prioridad para el monto: El que esté más a la derecha (estándar bancario)
            const montoObj = amountCandidates.sort((a, b) => b.idx - a.idx)[0];

            if (montoObj) {
                // 4. Encontrar CUIT (11 dígitos, que no sea la fecha ni el monto)
                const cuitIdx = row.findIndex((v, i) => i !== dateIdx && i !== montoObj.idx && v.replace(/[^0-9]/g, '').length === 11);
                const cuit = cuitIdx !== -1 ? row[cuitIdx].replace(/[^0-9]/g, '') : '';

                // 5. Encontrar Concepto (el string más largo de los que sobran)
                const conceptCandidates = row.filter((v, i) => i !== dateIdx && i !== montoObj.idx && i !== detectedTipoIdx && i !== cuitIdx);
                const desc = conceptCandidates.sort((a, b) => b.length - a.length)[0] || 'Sin concepto';

                let monto = montoObj.v;
                let tipo: 'DEBITO' | 'CREDITO' = monto < 0 ? 'DEBITO' : 'CREDITO';

                if (detectedTipoIdx !== -1 && row[detectedTipoIdx]) {
                    const tr = row[detectedTipoIdx].toUpperCase();
                    const isDebit = ['DEB', 'EGRESO', 'D', 'DEBITO', '-', '1', 'BAJA', 'GASTO'].some(k => tr.includes(k));
                    if (isDebit) {
                        monto = -Math.abs(monto);
                        tipo = 'DEBITO';
                    } else {
                        monto = Math.abs(monto);
                        tipo = 'CREDITO';
                    }
                }

                const tags = this.isTax(cuit, desc) ? ['impuesto_recuperable'] : [];
                if (['COMISION', 'MANTENIMIENTO', 'CUOTA', 'CARGO'].some(k => desc.toUpperCase().includes(k))) {
                    if (desc.toUpperCase().includes('MANT')) tags.push('mantenimiento');
                    else tags.push('comision_bancaria');
                }

                transactions.push({
                    fecha,
                    concepto: this.normalizeConcept(desc, thesaurus),
                    monto,
                    cuit,
                    tipo,
                    tags
                });
            }
        }
        return { transactions, hasExplicitTipo: detectedTipoIdx !== -1 };
    }

    /**
     * Parser de Ancho Fijo inteligente (sin tijeretazos hardcodeados)
     */
    private static parseFixedWith(lines: string[], thesaurus?: Map<string, string>): Transaction[] {
        const transactions: Transaction[] = [];
        for (const line of lines) {
            const trimmed = line.trim();
            // CORRECCIÓN: Si la línea tiene delimitadores, NO es fixed-width
            if (trimmed.length < 20 || trimmed.includes('|') || trimmed.includes(';')) continue;

            const dateMatch = trimmed.match(/(\d{2}[/-]\d{2}[/-]\d{2,4})/) || trimmed.match(/(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
            const amountMatch = trimmed.match(/(-?[\d\.,]+)$/);

            if (dateMatch && amountMatch) {
                const fechaRaw = dateMatch[0];
                const amountRaw = amountMatch[0];
                const fecha = this.normalizeDate(fechaRaw) || '';
                const monto = this.parseCurrency(amountRaw);

                // EXTRACCIÓN DINÁMICA: Lo que queda en medio
                const descArea = trimmed
                    .replace(fechaRaw, '')
                    .replace(amountRaw, '')
                    .trim();

                const concepto = this.normalizeConcept(descArea, thesaurus);

                transactions.push({
                    fecha,
                    concepto,
                    monto,
                    cuit: '',
                    tipo: monto < 0 ? 'DEBITO' : 'CREDITO'
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

        // Proteccion contra fechas y CUITs en el parseo de moneda
        if (str.includes('/') || (str.includes('-') && str.split('-').length === 3)) return 0;

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
