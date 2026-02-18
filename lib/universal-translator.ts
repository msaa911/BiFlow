import { createClient } from '@/lib/supabase/client';

export interface Transaction {
    fecha: string;
    concepto: string;
    monto: number;
    cuit: string;
    tipo: 'DEBITO' | 'CREDITO';
    tags?: string[];
    metadata?: any;
}

export interface TranslationResult {
    transactions: Transaction[];
    hasExplicitTipo: boolean;
    exampleRow?: Transaction;
    metadata: any;
}

export class UniversalTranslator {

    private static TAX_IDS = {
        AFIP: "33-69345023-9",
        ARBA: "30-54674267-9",
        SIRCREB: "30-99903208-3"
    };

    /**
     * ROUTER DE ESTRATEGIAS (Inteligencia Unificada v5.1)
     */
    static translate(rawText: string, options?: { invertSigns?: boolean, thesaurus?: Map<string, string> }): TranslationResult {
        const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length === 0) return { transactions: [], hasExplicitTipo: false, metadata: {} };

        // 1. DETECCIÓN INTELIGENTE
        const strategy = this.detectStrategy(lines);

        let transactions: Transaction[] = [];
        let hasExplicitTipo = false;

        console.log(`[UniversalTranslator] v5.1 Strategy: ${strategy.type} (Delim: ${strategy.delimiter || 'none'})`);

        // 2. EJECUCIÓN AISLADA
        if (strategy.type === 'INTERBANKING') {
            transactions = this.parseInterbankingStrategy(lines, options?.thesaurus);
            hasExplicitTipo = true;
        } else if (strategy.type === 'DELIMITED') {
            const res = this.parseDelimitedStrategy(lines, strategy.delimiter!, options?.thesaurus);
            transactions = res.transactions;
            hasExplicitTipo = res.hasExplicitTipo;
        } else {
            // Fallback: Fixed Width (Solo si NO es delimitado)
            transactions = this.parseGenericFixedStrategy(lines, options?.thesaurus);
        }

        // 3. POST-PROCESAMIENTO
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
            metadata: {}
        };
    }

    // --- DETECTOR DE ESTRATEGIA (CEREBRO) ---
    private static detectStrategy(lines: string[]): { type: 'INTERBANKING' | 'DELIMITED' | 'FIXED', delimiter?: string } {
        const sample = lines.slice(0, 50);

        // A. Interbanking: Firma (Fecha al inicio ... D/C al final)
        const interbankingMatches = sample.filter(l => /^\d{8}.*[DC]$/.test(l.trim())).length;
        if (interbankingMatches > 0 && interbankingMatches >= Math.min(sample.length, 5) * 0.4) {
            return { type: 'INTERBANKING' };
        }

        // B. Delimitado: Detección por RACHA (Streaks)
        const candidates = [
            { char: '|', threshold: 2 },
            { char: ';', threshold: 2 },
            { char: '\t', threshold: 2 },
            { char: ',', threshold: 3 }
        ];

        for (const cand of candidates) {
            let streak = 0;
            let lastCount = -1;
            for (const line of sample) {
                const count = line.split(cand.char).length;
                if (count > 1) {
                    if (count === lastCount || lastCount === -1) {
                        streak++;
                        lastCount = count;
                    } else {
                        streak = 1; lastCount = count;
                    }
                } else {
                    streak = 0; lastCount = -1;
                }
                if (streak >= cand.threshold) return { type: 'DELIMITED', delimiter: cand.char };
            }
        }

        // Fallback de densidad para CSVs con mucho ruido arriba
        const totalLines = sample.length;
        if (sample.filter(l => l.split('|').length > 1).length > totalLines * 0.2) return { type: 'DELIMITED', delimiter: '|' };
        if (sample.filter(l => l.split(';').length > 1).length > totalLines * 0.3) return { type: 'DELIMITED', delimiter: ';' };

        return { type: 'FIXED' };
    }

    // --- PARSER 1: INTERBANKING ---
    private static parseInterbankingStrategy(lines: string[], thesaurus?: Map<string, string>): Transaction[] {
        const txs: Transaction[] = [];
        for (const line of lines) {
            const trimmed = line.replace(/(\r\n|\n|\r)/gm, "");
            if (trimmed.length < 20 || !/^\d{8}/.test(trimmed)) continue;

            const lastChar = trimmed.slice(-1).toUpperCase();
            if (lastChar !== 'D' && lastChar !== 'C') continue;

            try {
                const fechaRaw = trimmed.substring(0, 8);
                const fecha = `${fechaRaw.substring(0, 4)}-${fechaRaw.substring(4, 6)}-${fechaRaw.substring(6, 8)}`;

                const rawMonto = trimmed.slice(-16, -1);
                let monto = parseInt(rawMonto) / 100;

                if (isNaN(monto)) continue;

                const tipo: 'DEBITO' | 'CREDITO' = lastChar === 'D' ? 'DEBITO' : 'CREDITO';
                monto = lastChar === 'D' ? -Math.abs(monto) : Math.abs(monto);

                const medio = trimmed.slice(8, -16);
                let concepto = medio;
                let cuit = '';
                let cbu = '';

                const cuitMatch = medio.match(/\b(20|23|27|30|33|24)\d{9}\b/);
                if (cuitMatch) {
                    cuit = cuitMatch[0];
                    concepto = medio.replace(cuit, '').trim();
                }

                const cbuMatch = medio.match(/\b\d{22}\b/);
                if (cbuMatch) {
                    cbu = cbuMatch[0];
                    if (!cuit) concepto = concepto.replace(cbu, '').trim();
                }

                const tags = this.getTags(cuit, concepto);
                concepto = this.normalizeConcept(concepto, thesaurus);

                txs.push({
                    fecha, concepto, monto: Math.abs(monto), cuit, tipo,
                    tags,
                    metadata: { cbu }
                });
            } catch (e) { continue; }
        }
        return txs;
    }

    // --- PARSER 2: DELIMITADOS (Flexible v5.1) ---
    private static parseDelimitedStrategy(lines: string[], delimiter: string, thesaurus?: Map<string, string>): { transactions: Transaction[], hasExplicitTipo: boolean } {
        let headerIdx = -1;
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
            const row = lines[i].toLowerCase();
            if ((row.includes('fecha') || row.includes('date') || row.includes('fec')) &&
                (row.includes('monto') || row.includes('importe') || row.includes('valor') || row.includes('descripcion') || row.includes('desc'))) {
                headerIdx = i; break;
            }
        }

        if (headerIdx === -1) {
            return this.parseDelimitedNoHeader(lines, delimiter, thesaurus);
        }

        const headers = lines[headerIdx].split(delimiter).map(h => h.trim().toLowerCase());
        const idx = {
            fecha: headers.findIndex(h => h.includes('fecha') || h.includes('date') || h.includes('fec')),
            monto: headers.findIndex(h => h.includes('monto') || h.includes('importe') || h.includes('valor') || h.includes('saldo')),
            desc: headers.findIndex(h => h.includes('concepto') || h.includes('desc') || h.includes('detalle') || h.includes('descripcion')),
            cuit: headers.findIndex(h => h.includes('cuit') || h.includes('doc')),
            tipo: headers.findIndex(h => h.includes('tipo') || h.includes('signo') || h.includes('movimiento'))
        };

        const txs: Transaction[] = [];

        for (const line of lines.slice(headerIdx + 1)) {
            const row = line.split(delimiter).map(v => v.trim());
            if (row.length < 2) continue;

            const fechaStr = row[idx.fecha];
            const fecha = this.normalizeDate(fechaStr);
            if (!fecha) continue;

            let montoStr = idx.monto !== -1 ? row[idx.monto] : '';
            if (!montoStr) continue;

            let monto = this.parseCurrency(montoStr);

            // VALIDACIÓN CUIT (FIX 10M)
            const cleanRaw = montoStr.replace(/[^0-9]/g, '');
            if (cleanRaw.length === 11 && this.isValidCUIT(cleanRaw)) continue;

            if (isNaN(monto) || monto === 0) continue;

            const descRaw = idx.desc !== -1 ? row[idx.desc] : '';
            const cuitVal = (idx.cuit !== -1 ? row[idx.cuit] : '').replace(/[^0-9]/g, '');

            // CBU Extraction from description if not in its own column
            const cbuMatch = descRaw.match(/\b\d{22}\b/);
            const cbu = cbuMatch ? cbuMatch[0] : '';

            const tags = this.getTags(cuitVal, descRaw);
            const concepto = this.normalizeConcept(descRaw, thesaurus);

            let tipo: 'DEBITO' | 'CREDITO' = monto < 0 ? 'DEBITO' : 'CREDITO';
            if (idx.tipo !== -1) {
                const tipoStr = row[idx.tipo]?.toUpperCase() || '';
                if (tipoStr.startsWith('D') || tipoStr.includes('DEB') || tipoStr.includes('EGRESO')) {
                    tipo = 'DEBITO'; monto = -Math.abs(monto);
                } else if (tipoStr.startsWith('C') || tipoStr.includes('CRE') || tipoStr.includes('INGRESO')) {
                    tipo = 'CREDITO'; monto = Math.abs(monto);
                }
            }

            txs.push({
                fecha, concepto, monto: Math.abs(monto), cuit: cuitVal, tipo,
                tags,
                metadata: { cbu }
            });
        }
        return { transactions: txs, hasExplicitTipo: idx.tipo !== -1 };
    }

    private static parseDelimitedNoHeader(lines: string[], delimiter: string, thesaurus?: Map<string, string>): { transactions: Transaction[], hasExplicitTipo: boolean } {
        const txs: Transaction[] = [];
        let dateIdx = -1;
        let amountIdx = -1;
        let cuitIdx = -1;

        const sample = lines.slice(0, 10).map(l => l.split(delimiter).map(v => v.trim()));

        for (const row of sample) {
            if (row.length < 2) continue;
            if (dateIdx === -1) dateIdx = row.findIndex(v => this.normalizeDate(v) !== null);
            if (amountIdx === -1) {
                const candidates = row.map((v, i) => ({ v: this.parseCurrency(v), i }))
                    .filter(c => c.i !== dateIdx && c.v !== 0);
                if (candidates.length > 0) {
                    amountIdx = candidates.sort((a, b) => b.i - a.i)[0].i;
                }
            }
            if (cuitIdx === -1) {
                cuitIdx = row.findIndex((v, i) => i !== dateIdx && i !== amountIdx && v.replace(/[^0-9]/g, '').length === 11 && this.isValidCUIT(v));
            }
        }

        if (dateIdx === -1 || amountIdx === -1) return { transactions: [], hasExplicitTipo: false };

        for (const line of lines) {
            const row = line.split(delimiter).map(v => v.trim());
            if (row.length <= Math.max(dateIdx, amountIdx)) continue;

            const fecha = this.normalizeDate(row[dateIdx]);
            if (!fecha) continue;

            let monto = this.parseCurrency(row[amountIdx]);
            if (monto === 0) continue;

            const cleanRaw = row[amountIdx].replace(/[^0-9]/g, '');
            if (cleanRaw.length === 11 && this.isValidCUIT(cleanRaw)) continue;

            const cuitVal = cuitIdx !== -1 && row[cuitIdx] ? row[cuitIdx].replace(/[^0-9]/g, '') : '';
            const descCandidates = row.filter((_, i) => i !== dateIdx && i !== amountIdx && i !== cuitIdx);
            const desc = descCandidates.sort((a, b) => b.length - a.length)[0] || 'Sin concepto';

            // CBU Extraction
            const cbuMatch = desc.match(/\b\d{22}\b/);
            const cbu = cbuMatch ? cbuMatch[0] : '';

            const tags = this.getTags(cuitVal, desc);
            const concepto = this.normalizeConcept(desc, thesaurus);

            txs.push({
                fecha, concepto, monto: Math.abs(monto), cuit: cuitVal, tipo: monto < 0 ? 'DEBITO' : 'CREDITO',
                tags,
                metadata: { cbu }
            });
        }
        return { transactions: txs, hasExplicitTipo: false };
    }

    // --- PARSER 3: FALLBACK (Fixed Width Genérico) ---
    private static parseGenericFixedStrategy(lines: string[], thesaurus?: Map<string, string>): Transaction[] {
        const txs: Transaction[] = [];
        for (const line of lines) {
            const trimmed = line.replace(/(\r\n|\n|\r)/gm, "");
            if (trimmed.length < 15) continue;
            if (trimmed.includes('|') || trimmed.includes(';')) continue;

            const dateMatch = trimmed.match(/(\d{2}[/-]\d{2}[/-]\d{2,4})/);
            const amountMatch = trimmed.match(/(-?[\d\.,]+)$/);

            if (dateMatch && amountMatch) {
                const fecha = this.normalizeDate(dateMatch[0]);
                const monto = this.parseCurrency(amountMatch[0]);
                if (fecha && monto !== 0) {
                    let concepto = trimmed.replace(dateMatch[0], '').replace(amountMatch[0], '').trim();
                    concepto = this.normalizeConcept(concepto, thesaurus);
                    txs.push({
                        fecha, concepto, monto: Math.abs(monto), cuit: '',
                        tipo: monto < 0 ? 'DEBITO' : 'CREDITO', tags: []
                    });
                }
            }
        }
        return txs;
    }

    // --- UTILS (Modulo 11 Real & Clean Normalization) ---
    public static isValidCUIT(cuit: string): boolean {
        const clean = cuit.replace(/[^0-9]/g, '');
        if (clean.length !== 11) return false;
        const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        let sum = 0;
        for (let i = 0; i < 10; i++) sum += parseInt(clean[i]) * factors[i];
        const checkDigit = parseInt(clean[10]);
        let computed = 11 - (sum % 11);
        if (computed === 11) computed = 0;
        if (computed === 10) computed = 9;
        return checkDigit === computed;
    }

    public static normalizeConcept(raw: string, thesaurus?: Map<string, string>): string {
        if (!raw) return 'Sin concepto';
        let clean = raw.trim().toUpperCase().replace(/\s{2,}/g, ' ').trim();
        if (thesaurus && thesaurus.has(clean)) return thesaurus.get(clean)!;
        return clean;
    }

    private static normalizeDate(raw: string): string | null {
        if (!raw) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

        const parts = raw.split(/[/-]/);
        if (parts.length === 3) {
            let [d, m, y] = parts;
            // Caso YYYY-MM-DD
            if (d.length === 4) return `${d}-${m.padStart(2, '0')}-${y.padStart(2, '0')}`;
            // Caso DD/MM/YY o DD/MM/YYYY
            if (y.length === 2) y = `20${y}`;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return null;
    }

    private static parseCurrency(montoStr: string): number {
        if (!montoStr) return 0;
        let clean = montoStr.replace(/[^0-9.,-]/g, '');
        if (clean.includes(',') && clean.includes('.')) {
            if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) return this.parseCurrencyEU(clean);
            else return this.parseCurrencyUS(clean);
        } else if (clean.includes(',')) return this.parseCurrencyEU(clean);
        else return this.parseCurrencyUS(clean);
    }

    private static parseCurrencyUS(str: string): number { return parseFloat(str.replace(/,/g, '')) || 0; }
    private static parseCurrencyEU(str: string): number { return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0; }

    public static getTags(cuit: string, concepto: string): string[] {
        const upper = concepto.toUpperCase();
        const tags: string[] = [];

        // 1. Impuestos
        if (['SIRCREB', 'IIBB', 'RETENCION', 'IMPUESTO', 'AFIP', 'ARBA'].some(k => upper.includes(k))) {
            tags.push('impuesto_recuperable');
        }

        // 2. Comisiones Bancarias
        if (['MANT', 'COMISION', 'SERVICIO', 'PAQUETE', 'MANTENIMIENTO'].some(k => upper.includes(k)) && !upper.includes('IVA')) {
            if (upper.includes('MANT') || upper.includes('PAQUETE')) {
                tags.push('mantenimiento');
            }
            tags.push('comision_bancaria');
        }

        // 3. Cheques
        if (['CHEQUE', 'CHQ', 'ECHEQ'].some(k => upper.includes(k)) && upper.includes('COM')) {
            tags.push('comision_cheque');
        }

        return tags;
    }

    public static isTax(cuit: string, concepto: string): boolean {
        return this.getTags(cuit, concepto).includes('impuesto_recuperable');
    }
}
