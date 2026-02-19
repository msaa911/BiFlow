import { createClient } from '@/lib/supabase/client';

export interface Transaction {
    fecha: string;
    concepto: string;
    monto: number;
    cuit: string;
    razon_social?: string;
    vencimiento?: string;
    numero?: string;
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
     * Identifica el formato y procesa el archivo (Versión 5.2 - Smart Split & Accents)
     */
    static translate(rawText: string, options?: { invertSigns?: boolean, thesaurus?: Map<string, string> }): TranslationResult {
        const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length === 0) return { transactions: [], hasExplicitTipo: false, metadata: {} };

        // Escanear las primeras líneas para detectar el formato de forma robusta
        const sampleText = lines.slice(0, 10).join('\n');
        const detectedDelimiter = this.detectDelimiter(sampleText);

        let transactions: Transaction[] = [];
        let hasExplicitTipo = false;

        if (detectedDelimiter) {
            // ESTRATEGIA 1: ARCHIVO DELIMITADO (CSV, Pipes, etc)
            const result = this.parseDelimited(lines, detectedDelimiter, options?.thesaurus);
            transactions = result.transactions;
            hasExplicitTipo = result.hasExplicitTipo;
        } else {
            // ESTRATEGIA 2: ANCHO FIJO / INTERBANKING
            transactions = this.parseFixedWith(lines, options?.thesaurus);
            hasExplicitTipo = false;
        }

        // Inversión manual de signos si se solicita
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
     * Detección Inteligente de Delimitadores (Ignora comas dentro de comillas)
     */
    private static detectDelimiter(textSample: string): string | null {
        const lines = textSample.split('\n').filter(l => l.trim().length > 0).slice(0, 10);
        if (lines.length === 0) return null;

        // Función auxiliar para contar separadores ignorando los que están entre comillas
        const countOutsideQuotes = (line: string, char: string) => {
            if (char !== ',') return line.split(char).length - 1;
            // Regex para contar comas fuera de comillas: ,(?=(?:(?:[^"]*"){2})*[^"]*$)
            try {
                const re = new RegExp(`\\${char}(?=(?:(?:[^"]*"){2})*[^"]*$)`, 'g');
                return (line.match(re) || []).length;
            } catch { return 0; }
        };

        const candidates = [
            { char: '|', threshold: 0.3 },
            { char: ';', threshold: 0.5 },
            { char: '\t', threshold: 0.5 },
            { char: ',', threshold: 0.5 },
            { char: 'SPACE_MULTI', threshold: 0.4 } // Nueva opción para archivos alineados
        ];

        for (const cand of candidates) {
            let consistentLines = 0;
            const delimiter = cand.char === 'SPACE_MULTI' ? /\s{2,}/ : cand.char;

            lines.forEach(l => {
                const parts = l.trim().split(delimiter);
                if (parts.length > 2) {
                    consistentLines++;
                }
            });

            if (consistentLines >= lines.length * 0.3) {
                return cand.char;
            }
        }
        return null;
    }

    private static parseDelimited(lines: string[], delimiter: string, thesaurus?: Map<string, string>): { transactions: Transaction[], hasExplicitTipo: boolean } {

        // Función de Split Inteligente (Maneja comillas: "1,200.00")
        const splitSmart = (text: string, delim: string) => {
            if (delim === 'SPACE_MULTI') return text.trim().split(/\s{2,}/);
            if (delim !== ',') return text.split(delim);
            const matches = text.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
            if (!matches || matches.length < 2) return text.split(delim);
            return matches.map(m => m.replace(/^"|"$/g, '').trim());
        };

        let headerIdx = -1;
        const keys = ['fecha', 'date', 'fec', 'emision', 'emisión', 'concepto', 'descripcion', 'detalle', 'monto', 'importe', 'mto', 'referencia', 'debito', 'credito', 'débito', 'crédito', 'comprobante', 'factura', 'cuit', 'razon social', 'razón social', 'cliente', 'proveedor', 'vencimiento', 'vto'];

        for (let i = 0; i < Math.min(lines.length, 30); i++) {
            const row = lines[i].toLowerCase();
            // Check if at least 2 keys are present in the row
            if (keys.filter(k => row.includes(k)).length >= 2) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) return this.parseNoHeader(lines, delimiter, thesaurus);

        // Usamos splitSmart también en el header
        const headers = splitSmart(lines[headerIdx], delimiter).map(h => h.trim().toLowerCase());

        // DICCIONARIO EXTENDIDO (Soporte de Tildes y Variantes)
        const idx = {
            fecha: headers.findIndex(h => ['fecha', 'fec', 'date', 'emision', 'emisión'].some(k => h.includes(k))),
            monto: headers.findIndex(h => ['monto', 'importe', 'valor', 'mto', 'total', 'saldo', 'precio', 'neto', 'bruto'].some(k => h.includes(k))),
            desc: headers.findIndex(h => ['concepto', 'descripcion', 'detalle', 'desc', 'referencia', 'leyenda', 'item', 'producto', 'servicio'].some(k => h.includes(k))),
            razon_social: headers.findIndex(h => ['razon social', 'razón social', 'nombre', 'cliente', 'proveedor', 'socio', 'titular', 'empresa', 'denominacion', 'denominación', 'emisor', 'receptor'].some(k => h.includes(k))),
            cuit: headers.findIndex(h => ['cuit', 'cuil', 'documento', 'id'].some(k => h.includes(k))),
            tipo: headers.findIndex(h => ['tipo', 'deb/cre', 'd/c', 'signo', 'movimiento', 'estado'].some(k => h.includes(k))),
            vencimiento: headers.findIndex(h => ['vencimiento', 'vto', 'due date', 'vence', 'vto.'].some(k => h.includes(k))),
            numero: headers.findIndex(h => ['numero', 'número', 'nro', 'comprobante', 'factura', 'fac', 'id', 'punto vta', 'pto vta'].some(k => h.includes(k))),
            // AQUÍ EL FIX DE TILDES:
            debito: headers.findIndex(h => ['debito', 'débito', 'debe', 'egreso', 'salida', 'cargo'].some(k => h.includes(k))),
            credito: headers.findIndex(h => ['credito', 'crédito', 'haber', 'ingreso', 'entrada', 'abono'].some(k => h.includes(k)))
        };

        const transactions: Transaction[] = [];

        for (const line of lines.slice(headerIdx + 1)) {
            const row = splitSmart(line, delimiter);
            if (row.length < 2) continue;

            const fecha = this.normalizeDate(row[idx.fecha]);
            if (!fecha) continue;

            let monto = 0;

            // LÓGICA DE DOBLE COLUMNA (Prioridad 1)
            if (idx.debito !== -1 && idx.credito !== -1) {
                const valDeb = this.parseCurrency(row[idx.debito]);
                const valCre = this.parseCurrency(row[idx.credito]);

                if (valDeb !== 0) {
                    monto = -Math.abs(valDeb); // Débito negativo
                } else if (valCre !== 0) {
                    monto = Math.abs(valCre);  // Crédito positivo
                }
            }
            // LÓGICA COLUMNA ÚNICA (Fallback)
            else if (idx.monto !== -1) {
                monto = this.parseCurrency(row[idx.monto]);
            }

            // Validación CUIT Trap (Evitar parsear CUITs como dinero)
            const montoRawClean = (idx.monto !== -1 ? (row[idx.monto] || '') : '').replace(/[^0-9]/g, '');
            if (montoRawClean.length === 11 && Math.abs(monto) > 10000000) {
                // Es probable que sea un CUIT en la columna incorrecta
            }

            let conceptoRaw = idx.desc !== -1 ? row[idx.desc] : '';
            if (!conceptoRaw && idx.razon_social !== -1) {
                conceptoRaw = row[idx.razon_social];
            }
            const concepto = this.normalizeConcept(conceptoRaw, thesaurus);
            const cuit = (idx.cuit !== -1 ? row[idx.cuit] : '').replace(/[^0-9]/g, '');

            // Lógica de Signos si viene en columna Tipo
            let tipo: 'DEBITO' | 'CREDITO' = monto < 0 ? 'DEBITO' : 'CREDITO';
            if (monto !== 0 && idx.tipo !== -1 && row[idx.tipo]) {
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
                    monto,
                    cuit,
                    razon_social: idx.razon_social !== -1 ? row[idx.razon_social] : undefined,
                    vencimiento: idx.vencimiento !== -1 ? this.normalizeDate(row[idx.vencimiento]) || undefined : undefined,
                    numero: idx.numero !== -1 ? row[idx.numero] : undefined,
                    tipo,
                    tags: []
                });
            }
        }

        return { transactions, hasExplicitTipo: (idx.debito !== -1 || idx.tipo !== -1) };
    }

    private static parseNoHeader(lines: string[], delimiter: string, thesaurus?: Map<string, string>): { transactions: Transaction[], hasExplicitTipo: boolean } {
        const transactions: Transaction[] = [];
        for (const line of lines) {
            const row = line.split(delimiter);
            if (row.length < 2) continue;

            const dateMatch = line.match(/(\d{2}[/-]\d{2}[/-]\d{2,4})/);
            if (!dateMatch) continue;

            const fecha = this.normalizeDate(dateMatch[1]);
            if (!fecha) continue;

            // Buscar el primer número que parezca un importe
            let monto = 0;
            for (const cell of row) {
                const val = this.parseCurrency(cell);
                if (val !== 0 && Math.abs(val) < 10000000) { // Evitar CUITs
                    monto = val;
                    break;
                }
            }

            if (monto !== 0) {
                transactions.push({
                    fecha,
                    concepto: this.normalizeConcept(line.substring(0, 50), thesaurus),
                    monto,
                    cuit: '',
                    tipo: monto < 0 ? 'DEBITO' : 'CREDITO'
                });
            }
        }
        return { transactions, hasExplicitTipo: false };
    }

    private static parseFixedWith(lines: string[], thesaurus?: Map<string, string>): Transaction[] {
        const transactions: Transaction[] = [];
        for (const line of lines) {
            const trimmed = line.replace(/(\r\n|\n|\r)/gm, "");
            if (trimmed.length < 10 || trimmed.includes('|') || trimmed.includes(';')) continue;

            const dateMatch = trimmed.match(/(\d{2}[/-]\d{2}[/-]\d{2,4})/) || trimmed.match(/(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
            const amountMatch = trimmed.match(/(-?[\d\.,]+)$/);

            if (dateMatch && amountMatch) {
                const fechaRaw = dateMatch[0];
                const amountRaw = amountMatch[0];
                const fecha = this.normalizeDate(fechaRaw) || '';
                const monto = this.parseCurrency(amountRaw);

                const descArea = trimmed.replace(fechaRaw, '').replace(amountRaw, '').trim();
                const concepto = this.normalizeConcept(descArea, thesaurus);

                if (fecha && monto !== 0) {
                    transactions.push({
                        fecha, concepto, monto, cuit: '',
                        tipo: monto < 0 ? 'DEBITO' : 'CREDITO'
                    });
                }
            }
        }
        return transactions;
    }

    public static normalizeConcept(raw: string, thesaurus?: Map<string, string>): string {
        if (!raw) return 'Sin concepto';
        let clean = raw.trim().toUpperCase()
            .replace(/[1-9]{10,}/g, '')
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
        const clean = raw.replace(/[^\d/.-]/g, ''); // Limpiar caracteres invisibles

        // Soporte para YYYYMMDD (Sin separadores)
        if (clean.length === 8 && /^\d{8}$/.test(clean)) {
            return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
        }

        const parts = clean.split(/[/-]/).filter(p => p.length > 0);

        if (parts.length === 3) {
            let [p1, p2, p3] = parts;
            // Soporte YYYY-MM-DD
            if (p1.length === 4) return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
            // Soporte DD-MM-YY o DD-MM-YYYY
            if (p1.length < 3 && p3.length >= 2) {
                if (p3.length === 2) p3 = `20${p3}`;
                return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
            }
        }
        return null;
    }

    private static parseCurrency(str: string): number {
        if (!str) return 0;
        // Limpieza de símbolos de moneda y espacios, manteniendo signos iniciales
        let clean = str.trim().replace(/[^0-9.,-]/g, '');
        if (!clean) return 0;

        // Detección automática de formato (EU/AR vs US)
        const lastComma = clean.lastIndexOf(',');
        const lastDot = clean.lastIndexOf('.');

        // Caso: 1.000,00 (AR/EU)
        if (lastComma > lastDot && lastComma !== -1) {
            clean = clean.replace(/\./g, '').replace(',', '.');
        }
        // Caso: 1,000.00 (US)
        else if (lastDot > lastComma && lastDot !== -1) {
            clean = clean.replace(/,/g, '');
        }
        // Caso: 1000,00 (Sin separador miles, coma decimal)
        else if (lastComma !== -1 && lastDot === -1) {
            clean = clean.replace(',', '.');
        }

        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    }

    public static isTax(cuit: string, concepto: string): boolean {
        const cleanCuit = cuit.replace(/-/g, '');
        const taxCuits = Object.values(this.TAX_IDS).map(id => id.replace(/-/g, ''));
        if (taxCuits.includes(cleanCuit)) return true;

        const upper = concepto.toUpperCase();
        const taxKeywords = ['SIRCREB', 'IIBB', 'RETENCION', 'IMPUESTO', 'AFIP', 'ARBA', 'PERCEPCION'];
        return taxKeywords.some(k => upper.includes(k)) && !upper.includes('IVA');
    }

    private static extractMetadata(lines: string[], transactions: Transaction[]) {
        const headerLines = lines.slice(0, 15).join('\n').toLowerCase();
        let saldoInicial = 0;
        let saldoFinal = 0;

        // Regex para detectar montos con etiquetas de saldo (Más inclusivo)
        const currencyRegex = (key: string) => new RegExp(`${key}.*?([0-9]{1,3}(?:[.,][0-9]{3})*[.,][0-9]{2})`, 'i');

        // Detectar saldos en encabezado
        const mInit = headerLines.match(currencyRegex('saldo (?:inicial|anterior)'));
        if (mInit) saldoInicial = this.parseCurrency(mInit[1]);

        const mEnd = headerLines.match(currencyRegex('saldo (?:final|actual|al)'));
        if (mEnd) saldoFinal = this.parseCurrency(mEnd[1]);

        // Calcular integridad matemática (Arqueo)
        if (saldoInicial !== 0 || saldoFinal !== 0) {
            const debs = transactions.filter(t => t.tipo === 'DEBITO').reduce((acc, t) => acc + Math.abs(t.monto), 0);
            const creds = transactions.filter(t => t.tipo === 'CREDITO').reduce((acc, t) => acc + Math.abs(t.monto), 0);

            const calc = saldoInicial + creds - debs;
            const diff = Math.abs(saldoFinal - calc);

            return {
                saldoInicial,
                saldoFinal,
                saldoCalculado: calc,
                diferencia: diff,
                isBalanced: diff < 0.05
            };
        }
        return {};
    }
}
