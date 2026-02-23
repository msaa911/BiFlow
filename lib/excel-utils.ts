import * as XLSX from 'xlsx'

export const ENTITY_COLUMNS = [
    { label: 'Razón Social / Nombre', key: 'razon_social' },
    { label: 'CUIT', key: 'cuit' },
    { label: 'CBU / CVU Habitual', key: 'cbu_habitual' },
    { label: 'Dirección', key: 'direccion' },
    { label: 'Localidad', key: 'localidad' },
    { label: 'Departamento', key: 'departamento' },
    { label: 'Provincia', key: 'provincia' },
    { label: 'Código Postal', key: 'codigo_postal' },
    { label: 'Email', key: 'email' },
    { label: 'Teléfono', key: 'telefono_1' },
    { label: 'Contacto', key: 'contacto' }
]

export function downloadEntityTemplate(category: string) {
    const ws = XLSX.utils.json_to_sheet([
        {
            'Razón Social / Nombre': 'ACME S.A.',
            'CUIT': '30-12345678-9',
            'CBU / CVU Habitual': '0000003100012345678901',
            'Dirección': 'Av. Siempreviva 742',
            'Localidad': 'Rosario',
            'Departamento': 'Rosario',
            'Provincia': 'SANTA FE',
            'Código Postal': '2000',
            'Email': 'contacto@acme.com',
            'Teléfono': '0341 4556677',
            'Contacto': 'Juan Perez'
        }
    ])

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')

    const filename = `plantilla_biFlow_${category}s.xlsx`
    XLSX.writeFile(wb, filename)
}

export function exportEntitiesToExcel(entities: any[], category: string) {
    const headers = [
        'Razón Social / Nombre', 'CUIT', 'Categoría', 'CBU Habitual',
        'Dirección', 'Localidad', 'Departamento', 'Provincia',
        'CP', 'Email', 'Teléfono', 'Contacto'
    ]

    const data = entities.map(ent => ({
        'Razón Social / Nombre': ent.razon_social,
        'CUIT': ent.cuit,
        'Categoría': ent.categoria,
        'CBU Habitual': ent.metadata?.cbu_habitual || '',
        'Dirección': ent.metadata?.direccion || '',
        'Localidad': ent.metadata?.localidad || '',
        'Departamento': ent.metadata?.departamento || '',
        'Provincia': ent.metadata?.provincia || '',
        'CP': ent.metadata?.codigo_postal || '',
        'Email': ent.metadata?.email || '',
        'Teléfono': ent.metadata?.telefono_1 || '',
        'Contacto': ent.metadata?.contacto || ''
    }))

    const ws = XLSX.utils.json_to_sheet(data, { header: headers })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Entidades')

    const filename = `biFlow_${category}s_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, filename)
}

// Helper to validate CUIT (simplified checksum or length/format)
export function isValidCUIT(cuit: string): boolean {
    const clean = cuit.replace(/[^\d]/g, '')
    if (clean.length !== 11) return false
    // Basic format check, could add full weighted checksum if needed
    return true
}

export async function parseEntityExcel(file: File): Promise<{ data: any[], errors: any[] }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const data = e.target?.result
                if (data instanceof ArrayBuffer) {
                    console.log('[Import] Fichero leído. Tamaño:', data.byteLength)
                }

                const workbook = XLSX.read(data, { type: 'array' })

                // Intelligent sheet selection
                const targetSheetName = workbook.SheetNames.find(n =>
                    /entidades|proveedores|clientes|plantilla|biflow/i.test(n)
                ) || workbook.SheetNames[0]

                if (!targetSheetName) throw new Error('El archivo Excel no tiene hojas válidas.')

                const sheet = workbook.Sheets[targetSheetName]
                const json = XLSX.utils.sheet_to_json(sheet)
                console.log('[Import] Hojas:', workbook.SheetNames, 'Seleccionada:', targetSheetName)
                console.log('[Import] Filas detectadas:', json.length)

                if (json.length === 0) {
                    resolve({ data: [], errors: ['El archivo no contiene filas de datos o está vacío.'] })
                    return
                }

                // Check for at least ONE recognizable header to avoid "blind" imports
                const firstRow = json[0] as any
                const hasHeaders = Object.keys(firstRow).some(k =>
                    /razon|social|nombre|cuit|empresa/i.test(k)
                )

                if (!hasHeaders) {
                    console.warn('[Import] No se detectaron cabeceras reconocibles. Columnas encontradas:', Object.keys(firstRow))
                }

                const results: any[] = []
                json.forEach((row: any, index: number) => {
                    const rowNum = index + 2

                    const getVal = (dataRow: any, opts: string[]) => {
                        const k = opts.find(o => dataRow[o] !== undefined)
                        return k ? String(dataRow[k]).trim() : ''
                    }

                    const rawCuit = getVal(row, ['CUIT', 'Cuit', 'cuit', 'CUIL', 'Identificación'])
                    const cleanCuit = rawCuit.replace(/[^\d]/g, '')
                    const razonSocial = getVal(row, ['Razón Social / Nombre', 'Nombre', 'Razon Social', 'Empresa', 'Proveedor', 'Denominación', 'Cliente'])

                    const itemErrors: string[] = []
                    if (!razonSocial) itemErrors.push('Falta Razón Social')
                    if (!cleanCuit) itemErrors.push('Falta CUIT')
                    else if (cleanCuit.length !== 11) itemErrors.push('CUIT debe tener 11 dígitos')

                    results.push({
                        id: `row-${rowNum}-${Math.random().toString(36).substr(2, 5)}`,
                        razon_social: razonSocial,
                        cuit: cleanCuit,
                        cbu_habitual: getVal(row, ['CBU / CVU Habitual', 'CBU', 'CVU']),
                        direccion: getVal(row, ['Dirección', 'Direccion', 'Calle']),
                        localidad: getVal(row, ['Localidad', 'Ciudad']),
                        departamento: getVal(row, ['Departamento', 'Partido']),
                        provincia: getVal(row, ['Provincia', 'Estado']),
                        codigo_postal: getVal(row, ['Código Postal', 'CP']),
                        email: getVal(row, ['Email', 'Mail']),
                        telefono_1: getVal(row, ['Teléfono', 'Telefono', 'Celular']),
                        contacto: getVal(row, ['Contacto', 'Responsable']),
                        rowNum,
                        errors: itemErrors,
                        isValid: itemErrors.length === 0
                    })
                })
                resolve({ data: results, errors: [] })
            } catch (err) {
                console.error('[Import] Error parseando Excel:', err)
                reject(err)
            }
        }
        reader.onerror = (err) => reject(new Error('Error de lectura física del archivo.'))
        reader.readAsArrayBuffer(file)
    })
}
