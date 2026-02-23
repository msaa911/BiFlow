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

export async function parseEntityExcel(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const data = e.target?.result
                const workbook = XLSX.read(data, { type: 'binary' })
                const sheetName = workbook.SheetNames[0]
                const sheet = workbook.Sheets[sheetName]
                const json = XLSX.utils.sheet_to_json(sheet)

                // Map columns
                const mapped = json.map((row: any) => ({
                    razon_social: row['Razón Social / Nombre'] || row['Nombre'] || row['Razon Social'],
                    cuit: String(row['CUIT'] || '').replace(/-/g, ''),
                    cbu_habitual: String(row['CBU / CVU Habitual'] || row['CBU'] || row['CBU Habitual'] || ''),
                    direccion: row['Dirección'] || row['Direccion'] || '',
                    localidad: row['Localidad'] || '',
                    departamento: row['Departamento'] || '',
                    provincia: row['Provincia'] || '',
                    codigo_postal: String(row['Código Postal'] || row['CP'] || ''),
                    email: row['Email'] || '',
                    telefono_1: row['Teléfono'] || row['Telefono'] || '',
                    contacto: row['Contacto'] || ''
                }))

                resolve(mapped.filter(m => m.razon_social && m.cuit))
            } catch (err) {
                reject(err)
            }
        }
        reader.onerror = reject
        reader.readAsBinaryString(file)
    })
}
