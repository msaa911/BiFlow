import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
    const fs = require('fs')
    const envFile = fs.readFileSync('.env.local', 'utf-8')
    const envConfig = envFile.split('\n').reduce((acc: any, line: string) => {
        const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
        if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
        return acc
    }, {})

    const supabaseUrl = envConfig['NEXT_PUBLIC_SUPABASE_URL']
    const supabaseKey = envConfig['SUPABASE_KEY'] || envConfig['SUPABASE_SERVICE_ROLE_KEY'] || envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY']

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing NEXT_PUBLIC_SUPABASE_URL or Key in environment");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: orgs } = await supabase.from('organizaciones').select('id').limit(1);
    if (!orgs || orgs.length === 0) {
        console.error("No organizations found in database");
        return;
    }
    const TEST_ORG_ID = orgs[0].id;

    console.log('--- STARTING DIAGNOSTIC RECONCILIATION ---')

    // 1. Check pending invoices
    const { data: pendingInvoices, error: invError } = await supabase
        .from('comprobantes')
        .select('*')
        .eq('organization_id', TEST_ORG_ID)
        .in('estado', ['pendiente', 'parcial'])

    console.log(`[DB] Found ${pendingInvoices?.length || 0} pending/partial invoices`)
    if (invError) console.error(invError)
    else {
        pendingInvoices?.forEach(i => console.log(`  - INV: ${i.numero} | Monto Orig ${i.monto_total} | Pen: ${i.monto_pendiente} | Entidad: ${i.cuit_socio}`))
    }

    // 2. Check pending trans
    const { data: pendingTrans, error: transError } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', TEST_ORG_ID)
        .in('estado', ['pendiente', 'parcial'])

    console.log(`\n[DB] Found ${pendingTrans?.length || 0} pending/partial trans`)
    if (transError) console.error(transError)
    else {
        pendingTrans?.forEach(t => {
            const used = Number(t.monto_usado || 0)
            const available = Math.abs(Number(t.monto)) - used
            console.log(`  - TX: ${t.referencia || t.descripcion} | Monto Orig: ${t.monto} | Disponible: ${available}`)
        })
    }

}

run().catch(console.error)
