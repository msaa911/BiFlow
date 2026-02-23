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
                const workbook = XLSX.read(data, { type: 'binary' })
                const sheetName = workbook.SheetNames[0]
                const sheet = workbook.Sheets[sheetName]
                const json = XLSX.utils.sheet_to_json(sheet)

                const results: any[] = []
                const errors: any[] = []

                json.forEach((row: any, index: number) => {
                    const rowNum = index + 2 // 1-indexed + header row
                    const rawCuit = String(row['CUIT'] || row['Cuit'] || '').trim()
                    const cleanCuit = rawCuit.replace(/[^\d]/g, '')
                    const razonSocial = (row['Razón Social / Nombre'] || row['Nombre'] || row['Razon Social'] || '').trim()

                    const itemErrors: string[] = []
                    if (!razonSocial) itemErrors.push('Falta Razón Social')
                    if (!cleanCuit) {
                        itemErrors.push('Falta CUIT')
                    } else if (cleanCuit.length !== 11) {
                        itemErrors.push('CUIT debe tener 11 dígitos')
                    }

                    const record = {
                        id: `row-${rowNum}`,
                        razon_social: razonSocial,
                        cuit: cleanCuit,
                        cbu_habitual: String(row['CBU / CVU Habitual'] || row['CBU'] || row['CBU Habitual'] || '').trim(),
                        direccion: (row['Dirección'] || row['Direccion'] || '').trim(),
                        localidad: (row['Localidad'] || '').trim(),
                        departamento: (row['Departamento'] || '').trim(),
                        provincia: (row['Provincia'] || '').trim(),
                        codigo_postal: String(row['Código Postal'] || row['CP'] || '').trim(),
                        email: (row['Email'] || '').trim(),
                        telefono_1: (row['Teléfono'] || row['Telefono'] || '').trim(),
                        contacto: (row['Contacto'] || '').trim(),
                        rowNum,
                        errors: itemErrors,
                        isValid: itemErrors.length === 0
                    }

                    results.push(record)
                })

                resolve({ data: results, errors })
            } catch (err) {
                reject(err)
            }
        }
        reader.onerror = reject
        reader.readAsBinaryString(file)
    })
}
