import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

function getEnvProps() {
    const envFile = fs.readFileSync('.env.local', 'utf8')
    const env = {}
    envFile.split('\n').forEach(line => {
        const parts = line.split('=')
        if (parts.length > 1) {
            env[parts[0]] = parts.slice(1).join('=').trim().replace(/['"]/g, '')
        }
    })
    return env
}

async function run() {
    console.log("--- Locating Exact Test Invoices ---")
    const env = getEnvProps()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase variables')
    const supabase = createClient(supabaseUrl, supabaseKey)

    const testNumeros = ['FAC-A-0001-1025', 'FAC-A-0001-1026', 'FAC-A-0001-1027'];

    const { data: foundInvoices, error } = await supabase
        .from('comprobantes')
        .select('organization_id, numero, estado, monto_total')
        .in('numero', testNumeros)

    if (error) {
        console.error("Error fetching", error);
        return;
    }

    console.log(`Found invoices matching test numbers: ${foundInvoices?.length || 0}`);
    if (foundInvoices && foundInvoices.length > 0) {
        console.table(foundInvoices)

        // Check trans for that org
        const orgId = foundInvoices[0].organization_id;
        const { data: trans } = await supabase.from('transacciones').select('monto, referencia').eq('organization_id', orgId).limit(5);
        console.log(`\nTransactions under organization ${orgId}:`)
        console.table(trans)
    }
}

run().catch(console.error)
