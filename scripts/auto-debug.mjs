import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Read .env.local
const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const NEXT_PUBLIC_SUPABASE_URL = envConfig['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_SERVICE_ROLE_KEY = envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY']

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function run() {
    console.log("Fetching all comprobantes...")

    const { data: invoices } = await supabase
        .from('comprobantes')
        .select('*')
        .order('fecha_emision', { ascending: true })

    const autos = invoices?.filter(i => i.metadata?.last_auto_reconciled || i.metadata?.reconciled_v2) || []
    console.log(`\n=== TOTAL AUTO-RECONCILED: ${autos.length} ===\n`)
    if (autos.length > 0) {
        autos.slice(0, 5).forEach(i => console.log(`  INV: ${i.id.slice(0, 8)} | Pen: ${i.monto_pendiente} | Est: ${i.estado}`))
    }
    console.log(`- Pending Invoices: ${invoices?.length || 0}`)
    // invoices?.forEach(i => console.log(`  INV: ${i.id.slice(0, 8)} | ${i.numero} | Monto T: ${i.monto_total} | Pen: ${i.monto_pendiente} | Est: ${i.estado} | Auto: ${i.metadata?.last_auto_reconciled ? "SI" : "NO"}`))

    const { data: trans } = await supabase
        .from('transacciones')
        .select('*')
        .in('estado', ['pendiente', 'parcial'])
        .order('fecha', { ascending: true })

    console.log(`- Pending Trans: ${trans?.length || 0}`)

    let matches = 0;
    trans?.forEach(tx => {
        const a = Math.abs(tx.monto) - Number(tx.monto_usado || 0);

        const isCobro = tx.monto > 0;
        const targetTipos = isCobro ? ['factura_venta', 'nota_debito', 'ingreso_vario'] : ['factura_compra', 'nota_credito', 'egreso_vario'];

        let targetInvoices = (invoices || []).filter((inv) => targetTipos.includes(inv.tipo));
        const match = targetInvoices?.find(i => Math.abs(Number(i.monto_pendiente) - a) < 0.05);

        if (match) {
            console.log(`[POTENTIAL] TX: ${a} (CUIT: '${tx.cuit}') <-> INV: ${match.monto_pendiente} (CUIT: '${match.cuit_socio}')`);

            const normalizeCuit = (cuit) => cuit ? cuit.replace(/\D/g, '') : '';
            const tC = normalizeCuit(tx.cuit);
            const iC = normalizeCuit(match.cuit_socio);

            if (tC && iC && tC !== iC) {
                console.log(`   [REJECTED] CUIT mismatch: ${tC} =/= ${iC}`);
            } else {
                matches++;
            }
        }
    });
    console.log(`\n=== STRICT 1:1 MATCHES AFTER CUIT FUNNEL: ${matches} ===\n`);
}
run().catch(console.error)
