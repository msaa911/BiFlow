import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Cargador simple de variables de entorno para scripts locales
try {
    const envFile = readFileSync('.env.local', 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...defaultVal] = line.split('=');
        if (key && defaultVal) process.env[key.trim()] = defaultVal.join('=').trim();
    });
} catch (e) {
    console.warn('Advertencia: No se pudo leer .env.local directamente');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no definidos.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectInvoiceData() {
    console.log('--- Inspeccionando Ingresos/Egresos (comprobantes) ---')

    const { data: invoices, error } = await supabase
        .from('comprobantes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

    if (error) {
        console.error('Error al obtener datos:', error)
        return
    }

    if (!invoices || invoices.length === 0) {
        console.log('No se encontraron comprobantes.')
        return
    }

    invoices.forEach((inv: any, index: number) => {
        console.log(`\n[${index + 1}] ID: ${inv.id}`)
        console.log(`Tipo: ${inv.tipo}`)
        console.log(`Número: ${inv.nro_factura || inv.numero}`)
        console.log(`Entidad: ${inv.razon_social_entidad}`)
        console.log(`Concepto: ${inv.concepto}`)
        console.log(`Metadata:`, JSON.stringify(inv.metadata, null, 2))
        console.log(`Monto: ${inv.monto_total}`)
    })
}

inspectInvoiceData()
