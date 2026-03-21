// UniversalTranslator.ts

export interface Transaction {
    fecha: string;
    concepto: string;
    monto: number;
    cuit?: string;
    numero?: string;
    razon_social?: string;
    banco?: string;
    vencimiento?: string | null;
    referencia?: string;
    tipo: 'ingreso' | 'egreso' | 'factura_venta' | 'factura_compra' | 'DEBITO' | 'CREDITO';
    tags?: string[];
    raw?: any[];
    metadata?: any;
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
        lowQuality?: boolean;
        sinConceptoCount?: number;
    }
}

export class UniversalTranslator {

    private static TAX_IDS = {
        AFIP: "33-69345023-9",
        ARBA: "30-54674267-9",
        SIRCREB: "30-99903208-3"
    };

    /**
     * Identifica el formato y procesa el archivo (Versión 6.1 - Sample for Mapping)
     */
    static translate(rawText: string, options?: {
        invertSigns?: boolean,
        thesaurus?: Map<string, string>,
        template?: { tipo: string, reglas: Record<string, any> }
    }): TranslationResult {
        const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length === 0) return { transactions: [], hasExplicitTipo: false, metadata: {} };

        let transactions: Transaction[] = [];
        let hasExplicitTipo = false;

        // ESTRATEGIA 0: TEMPLATE PERSONALIZADO (Visual Mapper)
        if (options?.template) {
            console.log(`[TRANSLATOR] Using custom template: ${options.template.tipo}`);

            // Si el template no tiene delimitador, intentamos detectarlo
            if (options.template.tipo === 'delimited' && !options.template.reglas.delimiter) {
                const sampleText = lines.slice(0, 10).join('\n');
                const detectedDelimiter = this.detectDelimiter(sampleText);
                if (detectedDelimiter) {
                    options.template.reglas.delimiter = detectedDelimiter;
                }
            }

            const result = this.parseWithTemplate(lines, options.template);
            transactions = result.transactions;
            hasExplicitTipo = result.hasExplicitTipo;
        } else {
            // Escanear las primeras líneas para detectar el formato de forma robusta
            const sampleText = lines.slice(0, 10).join('\n');
            const detectedDelimiter = this.detectDelimiter(sampleText);

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
        }

        // Inversión manual de signos si se solicita
        if (options?.invertSigns) {
            transactions = transactions.map(t => ({
                ...t,
                monto: -t.monto,
                tipo: t.monto > 0 ? 'DEBITO' : 'CREDITO'
            }));
        }

        const metadata = this.extractMetadata(lines, transactions);

        // --- CALIDAD DEL MAPEO ---
        const sinConcepto = transactions.filter(t => !t.concepto || t.concepto === 'Sin concepto').length;
        if (transactions.length > 0) {
            metadata.sinConceptoCount = sinConcepto;
            metadata.lowQuality = (sinConcepto / transactions.length) > 0.4;
        }

        return {
            transactions,
            hasExplicitTipo,
            exampleRow: transactions.find(t => t.monto !== 0),
            metadata
        };
    }

    /**
     * Detección Inteligente de Delimitadores (Ignora comas dentro de comillas)
     */
    private static detectDelimiter(textSample: string): string | null {
        // Sample up to 50 lines to handle large headers
        const lines = textSample.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 50);
        if (lines.length === 0) return null;

        const candidates = [
            { char: ';', name: 'Semicolon' },
            { char: '|', name: 'Pipe' },
            { char: '\t', name: 'Tab' },
            { char: ',', name: 'Comma' },
            { char: 'SPACE_MULTI', name: 'Multi-Space' }
        ];

        let bestDelim: string | null = null;
        let maxScore = 0;

        for (const cand of candidates) {
            let lineCounts: number[] = [];
            let appearances = 0;

            lines.forEach(l => {
                let parts = 0;
                if (cand.char === 'SPACE_MULTI') {
                    parts = l.trim().split(/\s{2,}/).length;
                } else if (cand.char === ',') {
                    const re = /,((?=(?:(?:[^"]*"){2})*[^"]*$))/g;
                    parts = (l.match(re) || []).length + 1;
                } else {
                    parts = l.split(cand.char).length;
                }

                // Any separator that repeatedly produces more than 2 columns is extremely significant
                if (parts >= 2) {
                    appearances++;
                    lineCounts.push(parts);
                }
            });

            // Scoring: appearances weight + consistency weight
            // A delim that appears in at least 2 lines is a candidate
            if (appearances >= 2) {
                // Consistency: do most lines have the same number of columns?
                const counts = new Map<number, number>();
                lineCounts.forEach(c => counts.set(c, (counts.get(c) || 0) + 1));
                const maxFreq = Math.max(...Array.from(counts.values()));

                // Score = number of appearances + bonus for consistency (Heavy weight on consistency)
                // If it's the only delim with appearances, give it a baseline boost
                let score = appearances + (maxFreq * 3.0);
                if (candidates.filter(c => c.char !== cand.char).every(c => !textSample.includes(c.char))) {
                    score += 10;
                }

                if (score > maxScore) {
                    maxScore = score;
                    bestDelim = cand.char;
                }
            }
        }

        return bestDelim;
    }


    private static parseDelimited(lines: string[], delimiter: string, thesaurus?: Map<string, string>): { transactions: Transaction[], hasExplicitTipo: boolean } {

        const rows = lines.map(l => this.splitSmart(l, delimiter));

        let headerIdx = -1;
        const keys = ['fecha', 'date', 'fec', 'emision', 'emisión', 'movimiento', 'concepto', 'descripcion', 'detalle', 'detalle movimiento', 'monto', 'importe', 'mto', 'referencia', 'debito', 'credito', 'débito', 'crédito', 'comprobante', 'factura', 'cuit', 'cuil', 'razon social', 'razón social', 'cliente', 'proveedor', 'vencimiento', 'vto', 'banco', 'bank', 'cheque', 'nro ch', 'nº cheque', 'iva', 'neto', 'bruto', 'subtotal', 'total', 'remito', 'orden de pago', 'op', 'orden de compra', 'oc', 'comision', 'cargo', 'referencia pgo'];

        for (let i = 0; i < Math.min(lines.length, 200); i++) {
            const row = lines[i].toLowerCase();
            // Check if at least 2 keys are present in the row
            if (keys.filter(k => row.includes(k)).length >= 2) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) return this.parseNoHeader(lines, delimiter, thesaurus);

        // Usamos splitSmart también en el header
        const headers = this.splitSmart(lines[headerIdx], delimiter).map((h: string) => h.trim().toLowerCase());

        // DICCIONARIO EXTENDIDO (Soporte de Tildes y Variantes)
        const idx = {
            fecha: headers.findIndex((h: string) => ['fecha', 'fec', 'date', 'emision', 'emisión', 'emiti'].some(k => h.includes(k))),
            monto: headers.findIndex((h: string) => ['monto', 'importe', 'valor', 'mto', 'total', 'precio', 'neto', 'bruto', 'subtotal', 'pagado'].some(k => h.includes(k))),
            desc: headers.findIndex((h: string) => ['movimiento', 'detalle movimiento', 'concepto', 'descripcion', 'detalle', 'desc', 'referencia', 'leyenda', 'item', 'producto', 'servicio', 'nota', 'obs', 'observacion', 'glosa'].some(k => h.includes(k))),
            razon_social: headers.findIndex((h: string) => ['razon social', 'razón social', 'nombre', 'cliente', 'proveedor', 'titular', 'denominacion', 'denominación', 'emisor', 'receptor', 'empresa', 'ente'].some(k => h.includes(k))),
            cuit: headers.findIndex((h: string) => ['cuit', 'cuil', 'documento', 'id', 'taxid', 'tipo/nro'].some(k => h.includes(k))),
            banco: headers.findIndex((h: string) => ['banco', 'bank', 'entidad', 'origen', 'sucursal'].some(k => h.includes(k))),
            tipo: headers.findIndex((h: string) => ['tipo', 'deb/cre', 'd/c', 'signo', 'movimiento', 'estado', 'mod', 'comp'].some(k => h.includes(k))),
            vencimiento: headers.findIndex((h: string) => ['vencimiento', 'vto', 'due date', 'vence', 'vto.'].some(k => h.includes(k))),
            referencia: headers.findIndex((h: string) => ['det. ref', 'detalle ref', 'detalle', 'referencia', 'nro op', 'nro rec', 'comprobante nro', 'nro operacion', 'id trx', 'voucher', 'transaccion'].some(k => h.includes(k))),
            nro_factura: headers.findIndex((h: string) => ['numero', 'número', 'nro', 'comprobante', 'factura', 'fac', 'id', 'punto vta', 'pto vta', 'nro doc', 'orden'].some(k => h.includes(k))),
            cheque: headers.findIndex((h: string) => ['cheque', 'nro ch', 'nº ch', 'nro. ch', 'numero de cheque', 'num cheque', 'nro_valor', 'num. chq'].some(k => h.includes(k))),
            cbu: headers.findIndex((h: string) => ['cbu', 'cta destino', 'cvu', 'cuenta destino', 'coordenada', 'cbu/alias'].some(k => h.includes(k))),
            debito: headers.findIndex((h: string) => ['debito', 'débito', 'debe', 'egreso', 'salida', 'cargo', 'retiro'].some(k => h.includes(k))),
            credito: headers.findIndex((h: string) => ['credito', 'crédito', 'haber', 'ingreso', 'entrada', 'abono', 'deposito'].some(k => h.includes(k))),
            saldo: headers.findIndex((h: string) => ['saldo', 'acumulado', 'balance'].some(k => h.includes(k)))
        };

        const transactions: Transaction[] = [];

        for (const line of lines.slice(headerIdx + 1)) {
            const row = this.splitSmart(line, delimiter);
            if (row.length < 2) continue;

            const fecha = this.normalizeDate(row[idx.fecha]);
            if (!fecha) continue;

            let monto = 0;

            // LÓGICA DE DOBLE COLUMNA (Prioridad 1)
            let hasMoney = false;
            if (idx.debito !== -1 && idx.credito !== -1) {
                const valDeb = this.parseCurrency(row[idx.debito]);
                const valCre = this.parseCurrency(row[idx.credito]);

                if (valDeb !== 0) {
                    monto = -Math.abs(valDeb); // Débito negativo
                    hasMoney = true;
                } else if (valCre !== 0) {
                    monto = Math.abs(valCre);  // Crédito positivo
                    hasMoney = true;
                }
            }

            // LÓGICA COLUMNA ÚNICA (Fallback si no hay dinero en Debito/Credito)
            if (!hasMoney && idx.monto !== -1) {
                monto = this.parseCurrency(row[idx.monto]);
            }

            // Validación CUIT Trap (Evitar parsear CUITs como dinero)
            const montoRawClean = (idx.monto !== -1 ? (row[idx.monto] || '') : '').replace(/[^0-9]/g, '');
            if (montoRawClean.length === 11 && Math.abs(monto) > 10000000) {
                // Es probable que sea un CUIT en la columna incorrecta
            }

            let conceptoRaw = idx.desc !== -1 ? row[idx.desc] : '';
            if (!String(conceptoRaw).trim() && idx.razon_social !== -1) {
                conceptoRaw = row[idx.razon_social];
            }
            // Fallback: Si no hay concepto, buscar cualquier columna con texto que no sea fecha/monto/cuit
            if (!String(conceptoRaw).trim()) {
                const textCol = row.find((cell, i) =>
                    i !== idx.fecha && i !== idx.monto && i !== idx.cuit &&
                    i !== idx.debito && i !== idx.credito &&
                    String(cell).trim().length > 3 && !/^\d+$/.test(String(cell).trim())
                );
                if (textCol) conceptoRaw = textCol;
            }
            const concepto = this.normalizeConcept(conceptoRaw, thesaurus);
            let cuit = (idx.cuit !== -1 ? String(row[idx.cuit] || '') : '').replace(/[^0-9]/g, '');
            if (cuit.length !== 11) {
                const cuitMatch = line.match(/\b(20|23|24|27|30|33|34)-?\d{8}-?\d\b/);
                if (cuitMatch) cuit = cuitMatch[0].replace(/-/g, '');
            }

            // Smart CBU Extraction (Search for 22 digits if not in explicit column)
            let cbu = idx.cbu !== -1 ? String(row[idx.cbu] || '').replace(/[^0-9]/g, '') : '';
            if (cbu.length !== 22) {
                const cbuMatch = line.match(/\b\d{22}\b/);
                if (cbuMatch) cbu = cbuMatch[0];
            }

            // Smart Cheque / Transfer Reference Extraction
            let numero_cheque = idx.cheque !== -1 ? row[idx.cheque] : '';
            let referencia = idx.referencia !== -1 ? row[idx.referencia] : '';

            if (!referencia || referencia === row[idx.desc] || /[^0-9A-Z]/i.test(referencia)) {
                // Si la referencia es igual al concepto o tiene basura, intentamos extraer el ID puro
                const textToSearch = (row[idx.desc] || '') + ' ' + (row[idx.nro_factura] || '') + ' ' + (idx.referencia !== -1 ? row[idx.referencia] : '') + ' ' + line;
                
                // Lógica Secuencial de Patrones (De más específico a más general)
                const patterns = [
                    /\b(?:TRF|TRANSF|TRANSFERENCIA|REF|ID|OP|OPER|VOU|VOUCHER|LIQ|COMP)[\s.:-]*([A-Z0-9]{4,15})\b/i,
                    /\b(?:CH|CHQ|CHEQUE|VALOR)[\s.:-]*(\d{4,12})\b/i,
                    /\b([A-Z0-9]{6,15})\b/i, // Alphanumeric IDs typical of transfers
                    /\b(\d{4,12})\b/ // Numbers (Last resort, 4+ digits)
                ];

                for (const p of patterns) {
                    const m = textToSearch.match(p);
                    if (m && m[1]) {
                        // Si ya teníamos una referencia de columna, pero el patrón encontró algo más "puro"
                        referencia = m[1];
                        if (p.toString().includes('CHEQUE') || p.toString().includes('CHQ') || p.toString().includes('VALOR')) {
                            numero_cheque = m[1];
                        }
                        break;
                    }
                }
            }
            
            // Limpieza final de la referencia para que sea puramente el ID
            if (referencia) {
                // Eliminar prefijos comunes que el regex pudo haber capturado si no se usó grupo
                referencia = referencia.replace(/^(TRF|REF|ID|OP|OPER|VOU|LIQ|COMP|CH|CHQ)[:\s.-]+/i, '');
                referencia = referencia.replace(/^0+/, '').trim();
            }

            // Lógica de Signos si viene en columna Tipo
            let tipo: 'DEBITO' | 'CREDITO' = monto < 0 ? 'DEBITO' : 'CREDITO';
            if (monto !== 0 && idx.tipo !== -1 && row[idx.tipo]) {
                const tr = String(row[idx.tipo]).toUpperCase();
                const isDebit = ['DEB', 'EGRESO', 'D', 'DEBITO', '-', '1', 'BAJA'].some(k => tr.includes(k));
                if (isDebit) {
                    monto = -Math.abs(monto);
                    tipo = 'DEBITO';
                } else {
                    monto = Math.abs(monto);
                    tipo = 'CREDITO';
                }
            }

            if (monto !== 0 && fecha) {
                const category = this.categorizeTransaction(conceptoRaw, monto, numero_cheque || undefined);
                transactions.push({
                    fecha,
                    concepto,
                    monto,
                    cuit: cuit || undefined,
                    razon_social: idx.razon_social !== -1 ? String(row[idx.razon_social] || '') : '',
                    banco: idx.banco !== -1 ? String(row[idx.banco] || '') : '',
                    // numero_cheque and cbu are now part of metadata or handled via numero / referencia
                    referencia: referencia || undefined,
                    vencimiento: idx.vencimiento !== -1 ? this.normalizeDate(row[idx.vencimiento]) : null,
                    numero: idx.nro_factura !== -1 ? String(row[idx.nro_factura] || '') : undefined,
                    tipo: tipo,
                    tags: [],
                    raw: row,
                    metadata: {
                        categoria: category,
                        cbu: cbu || undefined,
                        numero_cheque: numero_cheque || undefined,
                        saldo: idx.saldo !== -1 ? this.parseCurrency(row[idx.saldo]) : undefined
                    }
                });
            }
        }

        return { transactions, hasExplicitTipo: (idx.debito !== -1 || idx.tipo !== -1) };
    }

    private static parseNoHeader(lines: string[], delimiter: string, thesaurus?: Map<string, string>): { transactions: Transaction[], hasExplicitTipo: boolean } {
        const transactions: Transaction[] = [];
        for (const line of lines) {
            const row = delimiter === 'SPACE_MULTI' ? line.trim().split(/\s{2,}/) : line.split(delimiter);
            if (row.length < 2) continue;

            // Regex para capturar fechas en varios formatos (Separadores o YYYYMMDD)
            const dateMatch = line.match(/\b(\d{2}[/-]\d{2}[/-]\d{2,4})\b/) ||
                line.match(/\b(\d{8})\b/) ||
                line.match(/\b(\d{4}-\d{2}-\d{2})\b/);

            if (!dateMatch) continue;

            const fecha = this.normalizeDate(dateMatch[1]);
            if (!fecha) continue;

            // Buscar el primer número que parezca un importe
            let monto = 0;
            for (const cell of row) {
                const val = this.parseCurrency(cell);
                // Evitar CUITs y números que parezcan la fecha recién capturada
                if (val !== 0 && Math.abs(val) < 10000000 && !dateMatch[0].includes(String(Math.abs(val)))) {
                    monto = val;
                    break;
                }
            }

            if (monto !== 0 && fecha) {
                const category = this.categorizeTransaction(line, monto);
                transactions.push({
                    fecha,
                    concepto: this.normalizeConcept(line.substring(0, 50), thesaurus),
                    monto,
                    cuit: '',
                    tipo: (monto < 0 ? 'DEBITO' : 'CREDITO') as any,
                    metadata: { categoria: category }
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

                const cbuMatch = trimmed.match(/\b\d{22}\b/);
                const cbu = cbuMatch ? cbuMatch[0] : undefined;

                const chequeMatch = trimmed.match(/\b(?:CH|CHEQUE|PAGO CH|VALOR)\s?(\d{6,10})\b/i);
                const cheque = chequeMatch ? chequeMatch[1] : undefined;

                if (fecha && monto !== 0) {
                    const category = this.categorizeTransaction(descArea, monto, cheque);
                    transactions.push({
                        fecha, concepto, monto, cuit: '',
                        tipo: (monto < 0 ? 'DEBITO' : 'CREDITO') as any,
                        metadata: {
                            categoria: category,
                            cbu: cbu || undefined,
                            numero_cheque: cheque || undefined
                        }
                    });
                }
            }
        }
        return transactions;
    }

    public static normalizeConcept(raw: string, thesaurus?: Map<string, string>): string {
        if (!raw) return 'Sin concepto';
        let clean = String(raw).trim().toUpperCase()
            .replace(/[1-9]{11,}/g, '') // Less aggressive cleaning of numbers (avoid 10 digit check numbers)
            .replace(/\s{2,}/g, ' ')
            .trim();
        if (thesaurus) {
            if (thesaurus.has(clean)) return thesaurus.get(clean)!;
            for (const [key, value] of thesaurus.entries()) {
                const upperKey = key.toUpperCase();
                const wordPattern = new RegExp(`\\b${upperKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (wordPattern.test(clean)) return value;
            }
        }

        // Si después de limpiar el CUIT/CBU queda algo, lo devolvemos
        const finalClean = clean.replace(/[0-9]{11,}/g, '').trim();
        if (finalClean.length > 2) return finalClean;

        return clean || 'Sin concepto';
    }

    private static normalizeDate(raw: any): string | null {
        if (!raw) return null;
        let clean = String(raw).replace(/[^\d/.-]/g, ''); // Limpiar caracteres invisibles

        // Soporte para YYYYMMDD (Sin separadores)
        if (clean.length === 8 && /^\d{8}$/.test(clean)) {
            return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
        }

        const parts = clean.split(/[/-]/).filter(p => p.length > 0);

        if (parts.length === 3) {
            let [p1, p2, p3] = parts;
            // Caso 1: AAAA-MM-DD (Estándar ISO)
            if (p1.length === 4) return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;

            // Caso 2: DD/MM/AAAA o DD/MM/AA (Formato Argentino/Latinoamericano)
            if (p1.length <= 2 && p3.length >= 2) {
                // Si el año viene en 2 dígitos, asumimos 2000+
                if (p3.length === 2) p3 = `20${p3}`;
                return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
            }
        }
        return null;
    }

    private static parseCurrency(str: any): number {
        if (!str) return 0;
        // Limpieza de símbolos de moneda y espacios, manteniendo signos iniciales
        let clean = String(str).trim().replace(/[^0-9.,-]/g, '');
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
        // Caso: 156.436 (Punto como miles sin coma decimal)
        else if (lastDot !== -1 && lastComma === -1) {
            const parts = clean.split('.');
            // Heurística: Si hay 3 dígitos después del punto, es separador de miles
            if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
                clean = clean.replace(/\./g, '');
            }
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

        const upper = String(concepto || '').toUpperCase();
        const taxKeywords = ['SIRCREB', 'IIBB', 'RETENCION', 'IMPUESTO', 'AFIP', 'ARBA', 'PERCEPCION'];
        return taxKeywords.some(k => upper.includes(k)) && !upper.includes('IVA');
    }

    /**
     * Procesa el archivo usando reglas guardadas del Visual Mapper
     */
    private static parseWithTemplate(lines: string[], template: { tipo: string, reglas: Record<string, any> }): { transactions: Transaction[], hasExplicitTipo: boolean } {
        const transactions: Transaction[] = [];
        const { reglas } = template;

        for (const line of lines) {
            if (template.tipo === 'csv' || template.tipo === 'delimited') {
                const delimiter = template.reglas.delimiter || ',';
                const row = line.split(delimiter);

                // Mapeo por índice (ej: { fecha: 0, monto: 2 })
                const fechaIndex = reglas.fecha;
                if (fechaIndex === null || fechaIndex === undefined) continue;

                const fecha = this.normalizeDate(row[fechaIndex]);
                if (!fecha) continue;

                let monto = 0;
                // LÓGICA DE MONTO CONSOLIDADA:
                if (reglas.debito !== undefined && reglas.debito !== null && reglas.credito !== undefined && reglas.credito !== null) {
                    if (reglas.debito === reglas.credito) {
                        monto = this.parseCurrency(row[reglas.debito]);
                    } else {
                        const deb = Math.abs(this.parseCurrency(row[reglas.debito]));
                        const cre = Math.abs(this.parseCurrency(row[reglas.credito]));
                        monto = cre - deb;
                    }
                } else if (reglas.debito !== undefined && reglas.debito !== null) {
                    monto = -Math.abs(this.parseCurrency(row[reglas.debito]));
                } else if (reglas.credito !== undefined && reglas.credito !== null) {
                    monto = Math.abs(this.parseCurrency(row[reglas.credito]));
                } else if (reglas.monto !== undefined && reglas.monto !== null) {
                    monto = this.parseCurrency(row[reglas.monto]);
                }

                // Allow both 'concepto' and 'descripcion' in rules
                const conceptoIdx = (reglas.concepto !== undefined && reglas.concepto !== null)
                    ? reglas.concepto
                    : reglas.descripcion;

                if (conceptoIdx === null || conceptoIdx === undefined) {
                    // Si no hay concepto mapeado, podríamos intentar buscar una columna de texto, 
                    // pero por ahora saltamos o usamos un default.
                }

                const conceptoRaw = (conceptoIdx !== null && conceptoIdx !== undefined) ? (row[conceptoIdx] || '') : '';
                const concepto = this.normalizeConcept(conceptoRaw);

                // SMART EXTRACTION: Si CUIT/CBU/Cheque están en la misma columna que el concepto (o no están mapeados),
                // intentar extraerlos del texto del concepto.
                let cuit = (reglas.cuit !== null && reglas.cuit !== undefined) ? (row[reglas.cuit] || '') : '';
                if (!cuit || reglas.cuit === conceptoIdx) {
                    const cuitMatch = String(conceptoRaw).match(/\b(20|23|24|27|30|33|34)-?\d{8}-?\d\b/);
                    if (cuitMatch) cuit = cuitMatch[0].replace(/-/g, '');
                }

                let cbu = (reglas.cbu !== null && reglas.cbu !== undefined) ? (row[reglas.cbu] || '') : '';
                if (!cbu || reglas.cbu === conceptoIdx) {
                    const cbuMatch = String(conceptoRaw).match(/\b\d{22}\b/);
                    if (cbuMatch) cbu = cbuMatch[0];
                }

                let num = (reglas.numero !== null && reglas.numero !== undefined) ? (row[reglas.numero] || '') : '';
                let ref = (reglas.referencia !== null && reglas.referencia !== undefined) ? (row[reglas.referencia] || '') : '';
                if (!ref || reglas.referencia === conceptoIdx) {
                    const chMatch = String(conceptoRaw).match(/\b(?:CH|CHEQUE|PAGO CH|VALOR)\s?(\d{6,10})\b/i);
                    if (chMatch) {
                        const numero_cheque_val = chMatch[1];
                        ref = numero_cheque_val;
                    }
                }

                const category = this.categorizeTransaction(conceptoRaw, monto, ref || undefined);

                if (monto !== 0 || true) {
                    transactions.push({
                        fecha,
                        concepto,
                        monto,
                        tipo: (monto < 0 ? 'DEBITO' : 'CREDITO') as any,
                        cuit: cuit || undefined,
                        numero: num,
                        referencia: ref,
                        metadata: {
                            categoria: category,
                            cbu: cbu || undefined,
                            numero_cheque: ref || undefined
                        }
                    });
                }
            } else if (template.tipo === 'fixed_width') {
                // Mapeo por rangos (ej: { fecha: [0, 8], monto: [30, 42] })
                const fechaRaw = line.substring(reglas.fecha[0], reglas.fecha[1]).trim();
                const montoRaw = line.substring(reglas.monto[0], reglas.monto[1]).trim();
                const descRaw = line.substring(reglas.concepto[0], reglas.concepto[1]).trim();

                const fecha = this.normalizeDate(fechaRaw);
                const monto = this.parseCurrency(montoRaw);

                if (fecha && monto !== 0) {
                    transactions.push({
                        fecha,
                        concepto: this.normalizeConcept(descRaw),
                        monto,
                        tipo: (monto < 0 ? 'DEBITO' : 'CREDITO') as any
                    });
                }
            }
        }

        return { transactions, hasExplicitTipo: true };
    }

    /**
     * Retorna las primeras filas de un archivo para que el usuario pueda mapearlas visualmente.
     */
    static getSampleRows(rawText: string, maxRows: number = 20): any[][] {
        const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, maxRows);
        const sampleText = lines.join('\n');
        const delimiter = this.detectDelimiter(sampleText);

        return lines.map(line => {
            if (!delimiter) return [line];
            return this.splitSmart(line, delimiter);
        });
    }

    /**
     * Función de Split Inteligente (Maneja comillas y delimitadores específicos)
     */
    private static splitSmart(text: string, delim: string): string[] {
        if (!text) return [];
        if (delim === 'SPACE_MULTI') return text.trim().split(/\s{2,}/);

        if (delim === ',') {
            // Regex robusto para CSV: separa por comas pero ignora las que están dentro de comillas
            const result = [];
            let cell = '';
            let inQuotes = false;

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(cell.trim());
                    cell = '';
                } else {
                    cell += char;
                }
            }
            result.push(cell.trim());
            return result.map(c => c.replace(/^"|"$/g, '').trim());
        }

        return text.split(delim).map(c => c.trim());
    }

    private static categorizeTransaction(concepto: string, monto: number, numeroCheque?: string): string {
        const c = String(concepto || '').toUpperCase();

        // 1. CHEQUE (Prioridad Máxima)
        if (numeroCheque || c.includes('CHEQUE') || c.includes('CH ') || c.includes('VALOR') || c.includes('PAGO CH')) return 'CHEQUE';

        // 2. INTERESES
        if (c.includes('INTERES') || c.includes('GANAD') || c.includes('PAGAD') || c.includes('MORA') || c.includes('RENDIMIENTO')) return 'INTERESES';

        // 3. TRANSFERENCIA (Incluye haberes y pagos manuales)
        if (c.includes('TRANSFERENCIA') || c.includes('TRANSF') || c.includes('TRF') ||
            c.includes('EMITIDA') || c.includes('RECIBIDA') || c.includes('INMEDIATA') ||
            c.includes('HABERES') || c.includes('DEBITO OTRAS ENTIDADES') || c.includes('CREDITO OTRAS ENTIDADES') ||
            c.includes('PAGO AFIP') || c.includes('PAGO') || c.includes('COMPRA')) return 'TRANSFERENCIA';

        // 4. EFECTIVO
        if (c.includes('EFECTIVO') || c.includes('DEPOSITO CAJA') || c.includes('EXTRACCION') ||
            c.includes('ATM') || c.includes('CAJERO') || c.includes('RETIRO') || c.includes('VENTANILLA')) return 'EFECTIVO';

        // 5. TARJETA/DEBITO (Débitos automáticos de servicios)
        if (c.includes('DEBITO AUTO') || c.includes('SERV.') || c.includes('SUSCRIPCION') ||
            c.includes('SEGURO') || c.includes('CUOTA') || c.includes('PRÉSTAMO') || c.includes('CUOTA PRESTAMO')) return 'TARJETA/DEBITO';

        // 6. GASTOS/COMISIONES (Impuestos y Cargos bancarios)
        if (c.includes('COMISION') || c.includes('CARGO') || c.includes('IMPUESTO') ||
            c.includes('IVA') || c.includes('MANTENIMIENTO') || c.includes('PERCEPCION') ||
            c.includes('AFIP') || c.includes('ARBA') || c.includes('SIRCREB') || c.includes('RETENCION') ||
            c.includes('DEB.IMP.') || c.includes('SELLOS') || c.includes('RECAUDACION')) return 'GASTOS/COMISIONES';

        return 'OTROS';
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
        const metadata: any = {
            saldoInicial,
            saldoFinal
        };

        if (saldoInicial !== 0 || saldoFinal !== 0) {
            const debs = transactions.filter(t => t.tipo === 'DEBITO').reduce((acc, t) => acc + Math.abs(t.monto), 0);
            const creds = transactions.filter(t => t.tipo === 'CREDITO').reduce((acc, t) => acc + Math.abs(t.monto), 0);

            const calc = saldoInicial + creds - debs;
            const diff = Math.abs(saldoFinal - calc);

            metadata.saldoCalculado = calc;
            metadata.diferencia = diff;
            metadata.isBalanced = diff < 0.05;
        }
        return metadata;
    }
}
