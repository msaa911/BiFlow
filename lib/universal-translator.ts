
export interface Transaction {
    fecha: string;
    concepto: string;
    monto: number;
    cuit: string;
    tipo: 'DEBITO' | 'CREDITO';
}

export class UniversalTranslator {
    // CUITs oficiales para detección automática de retenciones
    private static TAX_IDS = {
        AFIP: "33693450239",
        ARBA: "30546742679"
    };

    /**
     * Identifica el formato y procesa el archivo
     */
    static translate(rawText: string): Transaction[] {
        const lines = rawText.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return [];

        const firstLine = lines[0];

        // 1. Detección de Formato Posicional (Fixed-width)
        // Si no hay delimitadores comunes y la línea es larga y densa
        if (!firstLine.includes(',') && !firstLine.includes(';') && !firstLine.includes('|')) {
            return this.parseFixedWith(lines);
        }

        // 2. Detección de Delimitadores (CSV/ERP/Pipe)
        const delimiter = this.detectDelimiter(firstLine);
        return this.parseDelimited(lines, delimiter);
    }

    private static detectDelimiter(line: string): string {
        if (line.includes(';')) return ';'; // Formato Bejerman/Interbanking
        if (line.includes('|')) return '|'; // Formato Pipe personalizado
        return ','; // Standard CSV
    }

    /**
     * Parser para formatos complicados (Posicionales)
     * Usa una estrategia híbrida: Patrón conocido (Interbanking/DAT) + Heurística
     */
    private static parseFixedWith(lines: string[]): Transaction[] {
        return lines.map(line => {
            const trimmed = line.replace(/(\r\n|\n|\r)/gm, "")
            if (trimmed.length < 20) return null

            // Pattern 1: Interbanking DAT Standard (as per user spec + hybrid robust)
            // Spec: Date(1-9), Concept(18-36), Amount(36-48), CUIT(48-59)
            // BUT we use Regex to be safe against slight offset shifts common in dirty files.

            let fecha = ''
            let concepto = ''
            let monto = 0
            let cuit = ''

            // 1. Try Date Regex (Robust)
            const dateMatch = trimmed.match(/(?:01)?(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/)
            if (dateMatch) {
                fecha = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
            } else {
                // Fallback to strict slicing if user insisted on fixed positions
                // Let's try to interpret "1,9" (8 chars).
                // If 1-based index: chars 1-8. If 0-based: 0-8. 
                // Defaulting to regex is safer for "Universal" translator.
            }

            // 2. Amount Search (Hybrid)
            // Look for amount in the expected range (36-48) or regex at end
            const amountMatch = trimmed.match(/(-?[\d\.,]+)$/)
            if (amountMatch) {
                const raw = amountMatch[1]
                if (!raw.includes('.') && !raw.includes(',') && raw.length > 15) {
                    // Suspiciously long number at end (CBU?)
                    // Try to extract from the middle (user said 36-48)
                    // Let's look for a block of digits ~12 chars long
                    const blocks = trimmed.split(/[^0-9]+/)
                    const amountBlock = blocks.find(b => b.length >= 10 && b.length <= 14 && !b.startsWith('202')) // Exclude date
                    if (amountBlock) {
                        monto = parseFloat(amountBlock) / 100
                    }
                } else {
                    monto = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
                }
            }

            // 3. Concept & CUIT
            if (fecha && monto !== 0) {
                // Heuristic for concept: Text between Date and Amount
                // Or strictly adhere to user spec if it matches perfectly
                concepto = trimmed.substring(18, 50).replace(/[0-9]{10,}/g, '').trim() // Clean long numbers

                // CUIT Search (11 digits)
                const cuitMatch = trimmed.match(/\b(20|23|27|30|33|24)[0-9]{9}\b/)
                if (cuitMatch) cuit = cuitMatch[0]
            }

            if (!fecha || monto === 0) return null

            return {
                fecha,
                concepto: concepto || 'Sin concepto',
                monto: Math.abs(monto),
                cuit: cuit || '',
                tipo: 'DEBITO' // Default assumption for expenses
            }
        }).filter((t): t is Transaction => t !== null)
    }

    /**
     * Parser para formatos delimitados (CSV/Excel exported to CSV)
     */
    private static parseDelimited(lines: string[], delimiter: string): Transaction[] {
        if (lines.length < 2) return []

        // Normalize headers to lowercase for flexible matching
        const headers = lines[0].toLowerCase().split(delimiter).map(h => h.trim().replace(/^"/, '').replace(/"$/, ''))

        // Helper to find value by possible column names
        const findCol = (row: string[], aliases: string[]) => {
            const idx = headers.findIndex(h => aliases.some(a => h.includes(a)))
            if (idx !== -1 && row[idx]) return row[idx].trim().replace(/^"/, '').replace(/"$/, '')
            return ''
        }

        return lines.slice(1).map(line => {
            // Split respecting potential quotes (basic imp)
            // specific logic might be needed for quoted CSVs with delimiters inside
            const row = line.split(delimiter)
            if (row.length < 2) return null

            let fecha = findCol(row, ['fecha', 'date', 'fec'])
            const concepto = findCol(row, ['concepto', 'detalle', 'descripcion', 'razon', 'referencia']) || 'Sin concepto'
            let montoStr = findCol(row, ['monto', 'importe', 'valor', 'debe', 'haber', 'saldo'])
            const cuit = findCol(row, ['cuit', 'cuil', 'id', 'tax']) || ''

            // Parse Date
            if (fecha) {
                // Try DD/MM/YYYY
                const parts = fecha.split(/[\/-]/)
                if (parts.length === 3) {
                    if (parts[2].length === 4) fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}` // DD/MM/YYYY
                    else if (parts[0].length === 4) fecha = `${parts[0]}-${parts[1]}-${parts[2]}` // YYYY-MM-DD
                }
            }

            // Parse Amount
            let monto = 0
            if (montoStr) {
                // Remove currency symbols and normalize ,/. 
                const clean = montoStr.replace(/[^0-9.,-]/g, '')
                monto = parseFloat(clean.replace(',', '.')) // naive, ideally check format
            }

            if (!fecha || isNaN(monto)) return null

            return {
                fecha,
                concepto,
                monto: Math.abs(monto), // Store absolute for now
                cuit,
                tipo: 'DEBITO'
            }
        }).filter((t): t is Transaction => t !== null)
    }
}
