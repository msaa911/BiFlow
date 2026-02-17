
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
    const lines = text.split('\n')
    const transactions: any[] = []
    const reviewItems: any[] = []

    for (const line of lines) {
        const trimmed = line.replace(/(\r\n|\n|\r)/gm, "") // Keep spaces! Fixed width relies on them.
        if (!trimmed || trimmed.length < 10) continue

        let fecha = ''
        let monto = 0
        let descripcion = ''
        let cuit = ''

        try {
            // Fecha
            if (rules.fecha) {
                const raw = safeSubstring(trimmed, rules.fecha.start, rules.fecha.end)
                // Assuming YYYYMMDD or DDMMYYYY. Let's try to normalize.
                // If 8 digits:
                if (raw.length === 8) {
                    // Try YYYYMMDD
                    if (raw.startsWith('20')) {
                        fecha = `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`
                    } else {
                        // DDMMYYYY
                        fecha = `${raw.substring(4, 8)}-${raw.substring(2, 4)}-${raw.substring(0, 2)}`
                    }
                }
            }

            // Descripcion
            if (rules.descripcion) {
                descripcion = safeSubstring(trimmed, rules.descripcion.start, rules.descripcion.end).trim()
            }

            // Monto
            if (rules.monto) {
                const raw = safeSubstring(trimmed, rules.monto.start, rules.monto.end)
                // Remove non-numeric except minus
                const clean = raw.replace(/[^0-9-]/g, '')
                monto = parseFloat(clean) / 100 // Assume 2 decimals for now, or use rule metadata
            }

            // Valid check
            if (fecha && !isNaN(monto) && descripcion) {
                transactions.push({
                    fecha,
                    descripcion,
                    monto,
                    moneda: 'ARS',
                    estado: 'pendiente',
                    origen_dato: 'fixed_width'
                })
            } else {
                reviewItems.push({
                    datos_crudos: { line: trimmed, parsed: { fecha, descripcion, monto } },
                    motivo: 'Regla de formato falló',
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

function safeSubstring(str: string, start: number, end: number): string {
    if (str.length < start) return ''
    return str.substring(start, end)
}
