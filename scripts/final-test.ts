import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

async function run() {
    const envFile = fs.readFileSync('.env.local', 'utf-8')
    const envConfig = envFile.split('\n').reduce((acc: any, line: string) => {
        const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
        if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
        return acc
    }, {})

    const supabaseUrl = envConfig['NEXT_PUBLIC_SUPABASE_URL']
    const supabaseKey = envConfig['SUPABASE_SERVICE_ROLE_KEY']

    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log("Fetching org...")
    const { data: orgs } = await supabase.from('organizaciones').select('id').limit(1)
    if (!orgs || orgs.length === 0) return console.log('No orgs')
    const orgId = orgs[0].id

    console.log("Org ID:", orgId)

    const { data: invoices } = await supabase
        .from('comprobantes')
        .select('*')
        .eq('organization_id', orgId)
        .neq('estado', 'pagado')

    const { data: trans } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .in('estado', ['pendiente', 'parcial'])

    console.log('Pending Invoices:', invoices?.length, 'Pending Trans:', trans?.length);
    let matches = 0;

    // Core Engine Logic Simplified
    for (const tx of (trans || [])) {
        const transAmount = Math.abs(Number(tx.monto)) - Number(tx.monto_usado || 0);
        const isCobro = tx.monto > 0;
        const targetTipos = isCobro ? ['factura_venta', 'nota_debito', 'ingreso_vario'] : ['factura_compra', 'nota_credito', 'egreso_vario'];

        let targetInvoices = (invoices || []).filter((inv: any) => targetTipos.includes(inv.tipo));

        // Exact Match
        const singleMatch = targetInvoices.find((inv: any) => Math.abs(Number(inv.monto_pendiente) - transAmount) < 0.05);
        if (singleMatch) {
            matches++;
            console.log(`Match Found! Tx: ${tx.monto} -> Inv: ${singleMatch.monto_pendiente}`)
        }
    }

    console.log('Total Exact Matches Simulated:', matches);
}
run().catch(console.error)
