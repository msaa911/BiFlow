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
                    const keys = Object.keys(row)

                    const getValByRegex = (pattern: RegExp) => {
                        const foundKey = keys.find(k => {
                            // Normalize key: lowercase and remove accents
                            const nk = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                            return pattern.test(nk)
                        })
                        return foundKey ? String(row[foundKey]).trim() : ''
                    }

                    const rawCuit = getValByRegex(/cuit|cuil|id|identificacion/i)
                    const cleanCuit = rawCuit.replace(/[^\d]/g, '')
                    const razonSocial = getValByRegex(/cliente|proveedor|razon|social|nombre|empresa|denominacion/i)

                    const itemErrors: string[] = []
                    if (!razonSocial) itemErrors.push('Falta Razón Social')
                    if (!cleanCuit) itemErrors.push('Falta CUIT')
                    else if (cleanCuit.length !== 11) itemErrors.push('CUIT debe tener 11 dígitos')

                    results.push({
                        id: `row-${rowNum}-${Math.random().toString(36).substr(2, 5)}`,
                        razon_social: razonSocial,
                        cuit: cleanCuit,
                        cbu_habitual: getValByRegex(/cbu|cvu|cuenta|habitual/i),
                        direccion: getValByRegex(/direccion|calle|domicilio/i),
                        localidad: getValByRegex(/localidad|ciudad/i),
                        departamento: getValByRegex(/departamento|partido/i),
                        provincia: getValByRegex(/provincia|estado/i),
                        codigo_postal: getValByRegex(/codigo|postal|cp/i),
                        email: getValByRegex(/email|mail/i),
                        telefono_1: getValByRegex(/telefono|tel|celular|cel/i),
                        contacto: getValByRegex(/contacto|responsable/i),
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

export function downloadInvoiceTemplate(type: 'factura_venta' | 'factura_compra') {
    const isVenta = type === 'factura_venta'
    const entityLabel = isVenta ? 'Cliente' : 'Proveedor'

    // Filas de ejemplo que cubren todos los medios de pago
    const rows = isVenta ? [
        {
            'Fecha Emisión': new Date().toLocaleDateString('es-AR'),
            'Fecha Vencimiento': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-AR'),
            'Cliente (Nombre o CUIT)': 'CLIENTE EJEMPLO S.A.',
            'CUIT Cliente': '30-12345678-9',
            'Número Comprobante': '0001-00000001',
            'Concepto / Descripción': 'Venta de mercadería',
            'Monto Total': 150000.50,
            'Condición (Contado/Cta Cte)': 'Cuenta Corriente',
            'Medio de Pago': 'Transferencia',
            'Banco (Opcional)': 'Banco Galicia',
            'Número de Instrumento (Opcional)': 'TRANSF-123'
        },
        { 'Medio de Pago': 'Efectivo (Indica Condición: Contado)' },
        { 'Medio de Pago': 'Transferencia' },
        { 'Medio de Pago': 'Tarjeta de Débito' },
        { 'Medio de Pago': 'Tarjeta de Crédito' },
        { 'Medio de Pago': 'Cheque' },
        { 'Medio de Pago': 'A convenir' }
    ] : [
        {
            'Fecha Emisión': new Date().toLocaleDateString('es-AR'),
            'Fecha Vencimiento': new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-AR'),
            'Proveedor (Nombre o CUIT)': 'PROVEEDOR LOGISTICA S.R.L.',
            'CUIT Proveedor': '30-44556677-8',
            'Número Comprobante': '0005-00012345',
            'Concepto / Descripción': 'Flete y distribución',
            'Monto Total': 85000.00,
            'Condición (Contado/Cta Cte)': 'Cuenta Corriente',
            'Medio de Pago': 'Cheque Propio',
            'Banco (Opcional)': 'Banco Nación',
            'Número de Instrumento (Opcional)': 'CHQ-998877'
        },
        { 'Medio de Pago': 'Efectivo' },
        { 'Medio de Pago': 'Transferencia' },
        { 'Medio de Pago': 'Tarjeta de Débito' },
        { 'Medio de Pago': 'Tarjeta de Crédito' },
        { 'Medio de Pago': 'Cheque Propio' },
        { 'Medio de Pago': 'Cheque de Terceros (Endosado)' },
        { 'Medio de Pago': 'Retenciones Impositivas' },
        { 'Medio de Pago': 'A convenir' }
    ]

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Comprobantes')

    const prefix = isVenta ? 'ingresos' : 'egresos'
    const filename = `plantilla_biflow_${prefix}.xlsx`
    XLSX.writeFile(wb, filename)
}

export async function parseInvoiceExcel(file: File): Promise<{ data: any[], errors: any[] }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const data = e.target?.result
                const workbook = XLSX.read(data, { type: 'array' })
                const targetSheetName = workbook.SheetNames.find(n =>
                    /facturas|comprobantes|ingresos|egresos|ventas|compras|plantilla/i.test(n)
                ) || workbook.SheetNames[0]

                if (!targetSheetName) throw new Error('No hay hojas válidas.')

                const sheet = workbook.Sheets[targetSheetName]
                const json = XLSX.utils.sheet_to_json(sheet)

                if (json.length === 0) {
                    resolve({ data: [], errors: ['Archivo vacío'] })
                    return
                }

                const results: any[] = []
                json.forEach((row: any, index: number) => {
                    const rowNum = index + 2
                    const keys = Object.keys(row)

                    const getValByRegex = (pattern: RegExp) => {
                        const foundKey = keys.find(k => {
                            const nk = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                            return pattern.test(nk)
                        })
                        return foundKey ? String(row[foundKey]).trim() : ''
                    }

                    const fechaEmision = getValByRegex(/fecha.*emision|fecha.*factura|emision/i)
                    const fechaVencimiento = getValByRegex(/fecha.*vencimiento|vencimiento|vence/i)
                    const cuit = getValByRegex(/cuit|cuil|id|identificacion/i).replace(/[^\d]/g, '')
                    const razonSocial = getValByRegex(/cliente|proveedor|socio|razon|social|nombre/i)
                    const numero = getValByRegex(/numero|nro|n°|factura|comprobante/i)
                    const montoRaw = getValByRegex(/monto|total|importe|valor/i)
                    const monto = parseFloat(montoRaw.replace(/[^\d.,]/g, '').replace(',', '.'))

                    const condicionRaw = getValByRegex(/condicion|pago|venta|compra/i).toLowerCase()
                    const condicion = (condicionRaw.includes('contado') || condicionRaw === 'efectivo') ? 'contado' : 'cuenta_corriente'

                    // Ignorar filas que sean solo ejemplos (sin número de factura ni monto)
                    if (!numero && isNaN(monto)) return

                    const itemErrors: string[] = []
                    if (!fechaEmision) itemErrors.push('Falta Fecha de Emisión')
                    if (!cuit && !razonSocial) itemErrors.push('Falta Cliente/Proveedor')
                    if (!numero) itemErrors.push('Falta Número de Comprobante')
                    if (isNaN(monto)) itemErrors.push('Monto inválido')

                    results.push({
                        id: `inv-${rowNum}-${Math.random().toString(36).substr(2, 5)}`,
                        fecha_emision: fechaEmision,
                        fecha_vencimiento: fechaVencimiento || fechaEmision,
                        cuit_socio: cuit,
                        razon_social_socio: razonSocial,
                        numero,
                        monto_total: monto,
                        condicion: condicion,
                        metodo_pago: getValByRegex(/metodo|medio|pago|instrumento/i),
                        concepto: getValByRegex(/concepto|descripcion|detalle/i),
                        banco: getValByRegex(/banco|entidad/i),
                        numero_cheque: getValByRegex(/instrumento|cheque|nro.*cheque/i),
                        rowNum,
                        errors: itemErrors,
                        isValid: itemErrors.length === 0
                    })
                })
                resolve({ data: results, errors: [] })
            } catch (err) {
                reject(err)
            }
        }
        reader.readAsArrayBuffer(file)
    })
}

export function exportTreasuryMovementToExcel(movement: any) {
    const isCobro = movement.tipo === 'cobro'
    const title = isCobro ? 'RECIBO DE COBRO' : 'ORDEN DE PAGO'

    // 1. Header Information
    const headerData = [
        { label: 'Comprobante', value: movement.numero },
        { label: 'Fecha', value: new Date(movement.fecha).toLocaleDateString('es-AR') },
        { label: 'Entidad', value: movement.entidades?.razon_social || 'N/A' },
        { label: 'Monto Total', value: movement.monto_total },
        { label: 'Observaciones', value: movement.observaciones || '' }
    ]

    // 2. Instruments (Valores)
    const instrumentsHeaders = ['Método', 'Monto', 'Disponibilidad', 'Banco', 'Referencia']
    const instrumentsData = movement.instrumentos_pago.map((ins: any) => ({
        'Método': ins.metodo.replace('_', ' ').toUpperCase(),
        'Monto': ins.monto,
        'Disponibilidad': new Date(ins.fecha_disponibilidad).toLocaleDateString('es-AR'),
        'Banco': ins.banco || '',
        'Referencia': ins.referencia || ''
    }))

    // 3. Applications (Facturas canceladas)
    const applicationsHeaders = ['Tipo Factura', 'Número', 'Monto Aplicado']
    const applicationsData = movement.aplicaciones_pago.map((app: any) => ({
        'Tipo Factura': app.comprobantes?.tipo.replace('_', ' ').toUpperCase(),
        'Número': app.comprobantes?.numero,
        'Monto Aplicado': app.monto_aplicado
    }))

    // Create Worksheet
    const wb = XLSX.utils.book_new()

    // Summary Sheet
    const wsHeader = XLSX.utils.json_to_sheet(headerData, { skipHeader: true })
    XLSX.utils.book_append_sheet(wb, wsHeader, 'Resumen')

    // Instruments Sheet
    const wsIns = XLSX.utils.json_to_sheet(instrumentsData, { header: instrumentsHeaders })
    XLSX.utils.book_append_sheet(wb, wsIns, 'Instrumentos')

    // Applications Sheet
    const wsApp = XLSX.utils.json_to_sheet(applicationsData, { header: applicationsHeaders })
    XLSX.utils.book_append_sheet(wb, wsApp, 'Imputaciones')

    const filename = `${movement.numero}_${movement.entidades?.razon_social.replace(/\s/g, '_')}.xlsx`
    XLSX.writeFile(wb, filename)
}
