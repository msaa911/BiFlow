import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY)

async function resetMixedTx() {
    console.log('--- STARTING RESET OF TRF-MIXED-123 ---');

    const { data: txs, error: txErr } = await supabase
        .from('transacciones')
        .select('*')
        .ilike('descripcion', '%TRF-MIXED-123%');

    if (!txs || txs.length === 0) {
        console.log('No transaction found for TRF-MIXED-123');
        return;
    }

    for (const tx of txs) {
        console.log(`\nFound Transaction: ${tx.id} | ${tx.descripcion} | State: ${tx.estado}`);

        // Reset transaction state
        await supabase.from('transacciones').update({
            estado: 'pendiente',
            movimiento_id: null,
            metadata: null,
            monto_usado: 0
        }).eq('id', tx.id);
        console.log(`Reset bank transaction ${tx.id} to pendiente.`);

        // Find movements that were linked to this tx via metadata before we wiped it?
        // Let's rely on the previous state or just fetch instruments by ref TRF-MIXED-123 and ensure they are pending.
        const { data: ins } = await supabase.from('instrumentos_pago').select('*').ilike('referencia', '%TRF-MIXED-123%');
        if (ins && ins.length > 0) {
            for (const i of ins) {
                await supabase.from('instrumentos_pago').update({ estado: 'pendiente' }).eq('id', i.id);
                console.log(`Reset instrument ${i.id} to pendiente.`);

                // Also reset the invoice if it was auto-reconciled
                const { data: apps } = await supabase.from('aplicaciones_pago').select('comprobante_id').eq('movimiento_id', i.movimiento_id);
                if (apps && apps.length > 0) {
                    for (const app of apps) {
                        if (app.comprobante_id) {
                            await supabase.from('comprobantes').update({ estado: 'pendiente' }).eq('id', app.comprobante_id);
                            console.log(`Reset invoice ${app.comprobante_id} to pendiente.`);
                        }
                    }
                }
            }
        }
    }
    console.log('--- RESET COMPLETE ---');
}

resetMixedTx();
