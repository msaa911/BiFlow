
export interface FormatRule {
    start: number
    end: number // Actually length or end index? The plan said [start, length] in one place and [start, end] in another. 
    // Let's use start and LENGTH for safety as fixed width usually implies length.
    // Or start and end index. "substring(start, end)" implies end index.
    // Plan example: "fecha": [0, 8] -> looks like start, length (8 chars). 
    // But substring params are (start, end_index). 
    // Let's support both or pick one. Start/Length is safer for "fixed width". 
    // Actually, in the user example: "fecha": { start: 1, end: 9 }. 
    // Let's stick to { start, end } (end exclusive) to match substring().
}

export interface FormatDefinition {
    id: string
    nombre: string
    reglas: Record<string, { start: number, end: number, type?: 'date' | 'number' | 'string' }>
}

export function parseFixed(text: string, rules: FormatDefinition['reglas']) {
    const lines = text.split(/\r?\n/)
    console.log(`DEBUG: parseFixed lines count: ${lines.length}`)
    const transactions: any[] = []
    const reviewItems: any[] = []

    let lineCount = 0
    for (const line of lines) {
        lineCount++
        const trimmed = line.replace(/(\r\n|\n|\r)/gm, "") // Keep spaces! Fixed width relies on them.
        if (lineCount <= 5) console.log(`DEBUG: Line ${lineCount} length: ${trimmed.length}, content: "${trimmed.substring(0, 50)}..."`)

        if (!trimmed || trimmed.length < 5) continue // Reduced from 10 to 5 for compatibility

        let fecha = ''
        let monto = 0
        let descripcion = ''
        let cuit = ''

        try {
            // Fecha
            if (rules.fecha) {
                const raw = safeSubstring(trimmed, rules.fecha.start, rules.fecha.end)
                fecha = normalizeDate(raw) || ''
            }

            // Descripcion/Concepto
            if (rules.descripcion) {
                descripcion = safeSubstring(trimmed, rules.descripcion.start, rules.descripcion.end).trim()
            } else if (rules.concepto) {
                // Support both names for the rule for extra robustness
                descripcion = safeSubstring(trimmed, rules.concepto.start, rules.concepto.end).trim()
            }

            // Monto
            if (rules.monto) {
                const raw = safeSubstring(trimmed, rules.monto.start, rules.monto.end).trim()

                // If the raw string already has a dot or comma, it might be an explicit decimal
                const hasExplicitSeparator = raw.includes('.') || raw.includes(',')

                const clean = raw.replace(/[^0-9.,-]/g, '').replace(',', '.')
                if (clean) {
                    const parsed = parseFloat(clean)
                    if (hasExplicitSeparator) {
                        monto = parsed
                    } else {
                        monto = parsed / 100 // Default to 2 decimals implied if no separator found
                    }
                }
            }

            // CUIT
            if (rules.cuit) {
                cuit = safeSubstring(trimmed, rules.cuit.start, rules.cuit.end).replace(/[^0-9]/g, '')
            }

            // Tipo (Sign Detection)
            if (rules.tipo) {
                const tipoRaw = safeSubstring(trimmed, rules.tipo.start, rules.tipo.end).trim().toUpperCase()
                // Heuristic for Debit (Negative)
                const isDebit = ['D', 'DEB', '-', 'EGRESO', '01', '10', 'DEBITO', 'BAJA', 'RESTO'].some(k => tipoRaw.includes(k))
                const isCredit = ['C', 'CRE', '+', 'INGRESO', '02', '20', 'CREDITO', 'ALTA', 'SUMA'].some(k => tipoRaw.includes(k))

                if (isDebit) {
                    monto = -Math.abs(monto)
                } else if (isCredit) {
                    monto = Math.abs(monto)
                }
            }

            // Valid check
            if (fecha && !isNaN(monto) && monto !== 0 && (descripcion || true)) {
                transactions.push({
                    fecha,
                    concepto: descripcion || 'Sin descripción',
                    monto,
                    cuit,
                    tags: [],
                    moneda: 'ARS',
                    estado: 'pendiente',
                    origen_dato: 'fixed_width'
                })
            } else {
                reviewItems.push({
                    datos_crudos: { line: trimmed, parsed: { fecha, descripcion, monto, cuit } },
                    motivo: !fecha ? 'Fecha no detectada' : (monto === 0 ? 'Monto es cero' : 'Datos incompletos'),
                    estado: 'pendiente'
                })
            }

        } catch (e: any) {
            reviewItems.push({
                datos_crudos: { line: trimmed },
                motivo: `Error parseo: ${e.message}`,
                estado: 'pendiente'
            })
        }
    }

    return { transactions, reviewItems }
}

function normalizeDate(str: string): string | null {
    // Remove common fixed-width "garbage" like leading/trailing pipes or separators if loose selection
    const raw = str.replace(/[|:;]/g, '').trim()
    if (!raw) return null

    // Pattern 1: YYYYMMDD or DDMMYYYY (8 digits)
    const digitMatch = raw.match(/\d{8}/)
    if (digitMatch) {
        const digits = digitMatch[0]
        if (digits.startsWith('20')) {
            return `${digits.substring(0, 4)}-${digits.substring(4, 6)}-${digits.substring(6, 8)}`
        } else {
            return `${digits.substring(4, 8)}-${digits.substring(2, 4)}-${digits.substring(0, 2)}`
        }
    }

    // Pattern 2: DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
    const parts = raw.split(/[/-]/).map(p => p.replace(/\D/g, ''))
    if (parts.length === 3) {
        let [d, m, y] = parts
        if (d.length === 4) return `${d}-${m.padStart(2, '0')}-${y.padStart(2, '0')}` // YYYY-MM-DD
        if (y.length === 2) y = `20${y}`
        if (y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }

    return null
}

function safeSubstring(str: string, start: number, end: number): string {
    if (str.length < start) return ''
    return str.substring(start, end)
}
