import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const supabase = createClient(envConfig['NEXT_PUBLIC_SUPABASE_URL'], envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'])

async function run() {
    console.log("Reversing auto-reconciled invoices...")

    const { data: autos } = await supabase
        .from('comprobantes')
        .select('*')
        .eq('estado', 'pagado')

    if (!autos || autos.length === 0) {
        console.log("No pagado invoices found to reset.")
        return
    }

    console.log(`Found ${autos.length} invoices to reset.`)

    // 2. Get applications for these invoices to find the movimientos
    const invoiceIds = autos.map(i => i.id)
    const { data: apps } = await supabase
        .from('aplicaciones_pago')
        .select('movimiento_id')
        .in('comprobante_id', invoiceIds)

    const movIds = [...new Set(apps?.map(a => a.movimiento_id))]
    console.log(`Found ${movIds.length} related movimientos to delete.`)

    // 3. Get transactions linked to these movimientos
    const { data: trans } = await supabase
        .from('transacciones')
        .select('id')
        .in('movimiento_id', movIds)

    const transIds = trans?.map(t => t.id) || []
    console.log(`Found ${transIds.length} related transactions to reset.`)

    // 4. Update transactions back to pendiente
    if (transIds.length > 0) {
        await supabase.from('transacciones').update({
            estado: 'pendiente',
            monto_usado: 0,
            movimiento_id: null
        }).in('id', transIds)
        console.log("Reset transacciones completed.")
    }

    // 5. Update invoices back to pendiente
    for (const inv of autos) {
        const meta = { ...inv.metadata };
        delete meta.last_auto_reconciled;
        delete meta.desc_transaccion;

        await supabase.from('comprobantes').update({
            estado: 'pendiente',
            monto_pendiente: inv.monto_total,
            metadata: meta
        }).eq('id', inv.id)
    }
    console.log("Reset comprobantes completed.")

    // 6. Delete movimientos (cascades to apps and instruments)
    if (movIds.length > 0) {
        await supabase.from('movimientos_tesoreria').delete().in('id', movIds)
        console.log("Deleted movimientos_tesoreria completed.")
    }

    console.log("Reset successfully finished! The user can now click the UI button to see them auto-reconcile.")
}
run().catch(console.error)
