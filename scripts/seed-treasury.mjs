import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function seed() {
    console.log('Fetching first organization...')
    const { data: orgs, error: orgError } = await supabase.from('organizations').select('id').limit(1)

    if (orgError || !orgs || orgs.length === 0) {
        console.error('Could not find any organization to link the data.', orgError)
        return
    }

    const orgId = orgs[0].id
    console.log(`Using Organization ID: ${orgId}`)

    const comprobantes = [
        // 1. ACCOUNTS RECEIVABLE (Cuentas por Cobrar / Ventas)
        {
            organization_id: orgId,
            tipo: 'factura_venta',
            numero: 'FAC - 2323223',
            cuit_socio: '30-71042147',
            razon_social_socio: 'Ricardo Lopez S.A.',
            fecha_emision: '2026-02-01',
            fecha_vencimiento: '2026-02-01',
            monto_total: 156436.00,
            monto_pendiente: 0.00,
            estado: 'pagado',
            moneda: 'ARS'
        },
        {
            organization_id: orgId,
            tipo: 'factura_venta',
            numero: 'FAC - 2323224',
            cuit_socio: '30-70787072',
            razon_social_socio: 'Alberto Fernandez S.A.',
            fecha_emision: '2026-01-02',
            fecha_vencimiento: '2026-02-02',
            monto_total: 88432.00,
            monto_pendiente: 0.00,
            estado: 'pagado',
            moneda: 'ARS'
        },
        {
            organization_id: orgId,
            tipo: 'factura_venta',
            numero: 'FAC - 2323225',
            cuit_socio: '30-71203330',
            razon_social_socio: 'Sofia Martinez S.A.',
            fecha_emision: '2026-01-02',
            fecha_vencimiento: '2026-02-03',
            monto_total: 153380.00,
            monto_pendiente: 0.00,
            estado: 'pagado',
            moneda: 'ARS'
        },
        {
            organization_id: orgId,
            tipo: 'factura_venta',
            numero: 'FAC - 2323241',
            cuit_socio: '30-70793835',
            razon_social_socio: 'Gabriel Sosa S.A.',
            fecha_emision: '2026-01-07',
            fecha_vencimiento: '2026-02-19',
            monto_total: 1058600.00,
            monto_pendiente: 1058600.00,
            estado: 'pendiente',
            moneda: 'ARS'
        },
        {
            organization_id: orgId,
            tipo: 'factura_venta',
            numero: 'FAC - 2323242',
            cuit_socio: '30-71042147',
            razon_social_socio: 'Ricardo Lopez S.A.',
            fecha_emision: '2026-01-07',
            fecha_vencimiento: '2026-02-20',
            monto_total: 759375.00,
            monto_pendiente: 759375.00,
            estado: 'pendiente',
            moneda: 'ARS'
        },
        // 2. ACCOUNTS PAYABLE (Cuentas por Pagar / Compras)
        {
            organization_id: orgId,
            tipo: 'factura_compra',
            numero: 'FAC-P-001',
            cuit_socio: '30-71042147',
            razon_social_socio: 'Impresiones Quantum S.R.L.',
            fecha_emision: '2026-02-01',
            fecha_vencimiento: '2026-02-05',
            monto_total: 156436.00,
            monto_pendiente: 0.00,
            estado: 'pagado',
            moneda: 'ARS'
        },
        {
            organization_id: orgId,
            tipo: 'factura_compra',
            numero: 'FAC-P-002',
            cuit_socio: '30-70787072',
            razon_social_socio: 'Almacen Logistico Global',
            fecha_emision: '2026-02-01',
            fecha_vencimiento: '2026-02-08',
            monto_total: 88432.00,
            monto_pendiente: 0.00,
            estado: 'pagado',
            moneda: 'ARS'
        },
        {
            organization_id: orgId,
            tipo: 'factura_compra',
            numero: 'FAC-P-007',
            cuit_socio: '30-70316957',
            razon_social_socio: 'Desarrollos Floresta S.R.L.',
            fecha_emision: '2026-02-03',
            fecha_vencimiento: '2026-02-20',
            monto_total: 50000.00,
            monto_pendiente: 50000.00,
            estado: 'pendiente',
            moneda: 'ARS'
        },
        {
            organization_id: orgId,
            tipo: 'factura_compra',
            numero: 'FAC-P-008',
            cuit_socio: '30-71540082',
            razon_social_socio: 'CarPark Soluciones',
            fecha_emision: '2026-02-03',
            fecha_vencimiento: '2026-02-22',
            monto_total: 300000.00,
            monto_pendiente: 300000.00,
            estado: 'pendiente',
            moneda: 'ARS'
        },
        {
            organization_id: orgId,
            tipo: 'factura_venta',
            numero: 'FAC-V-BIG-1',
            cuit_socio: '20-22391730',
            razon_social_socio: 'Fernando Ruiz S.A.',
            fecha_emision: '2026-02-07',
            fecha_vencimiento: '2026-02-21',
            monto_total: 633268.00,
            monto_pendiente: 633268.00,
            estado: 'pendiente',
            moneda: 'ARS'
        },
        {
            organization_id: orgId,
            tipo: 'factura_compra',
            numero: 'FAC-P-BIG-1',
            cuit_socio: '30-70793835',
            razon_social_socio: 'Redes Giga S.A.',
            fecha_emision: '2026-02-07',
            fecha_vencimiento: '2026-02-21',
            monto_total: 1058600.00,
            monto_pendiente: 1058600.00,
            estado: 'pendiente',
            moneda: 'ARS'
        }
    ]

    console.log(`Inserting ${comprobantes.length} comprobantes...`)
    const { error: insertError } = await supabase.from('comprobantes').insert(comprobantes)

    if (insertError) {
        console.error('Error inserting comprobantes:', insertError)
        console.log('Querying available tables to debug...')
        const { data: tables, error: tableError } = await supabase.rpc('get_tables') // Hypothetical or check standard tables
        if (tableError) {
            // Fallback: try to query 'transacciones' which we know should exist
            const { data: trans, error: transError } = await supabase.from('transacciones').select('id').limit(1)
            console.log('Transacciones check:', transError ? 'Missing' : 'Exists')
        }
    } else {
        console.log('Successfully seeded treasury data! 🚀')
    }
}

seed()
