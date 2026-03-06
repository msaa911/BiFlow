const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function inspectInvoiceData() {
    console.log('--- Inspecting Incomes/Expenses (comprobantes) ---')

    const { data: invoices, error } = await supabase
        .from('comprobantes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

    if (error) {
        console.error('Error:', error)
        return
    }

    invoices.forEach((inv, index) => {
        console.log(`\n[${index + 1}] ID: ${inv.id} | Tipo: ${inv.tipo}`)
        console.log(`Número: ${inv.nro_factura || inv.numero}`)
        console.log(`Entidad: ${inv.razon_social_socio}`)
        console.log(`Concepto: ${inv.concepto}`)
        console.log(`Metadata:`, JSON.stringify(inv.metadata, null, 2))
    })
}

inspectInvoiceData()
