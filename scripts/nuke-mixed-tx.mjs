import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY)

async function nukeMixedTx() {
    console.log('--- STARTING AGGRESSIVE WIPE OF TRF-MIXED-123 ---');

    const { data: txs, error: txErr } = await supabase
        .from('transacciones')
        .select('*')
        .ilike('descripcion', '%TRF-MIXED-123%');

    if (!txs || txs.length === 0) {
        console.log('No transaction found for TRF-MIXED-123. It might be cached in the UI or already deleted.');
        return;
    }

    for (const tx of txs) {
        console.log(`\nFound Transaction: ${tx.id} | ${tx.descripcion} | State: ${tx.estado}`);
        console.log(`Metadata:`, tx.metadata);

        // Let's just DELETE it entirely to be absolutely sure it's gone from the bank view.

        const principalMovId = tx.movimiento_id;
        const allMovIds = tx.metadata?.all_movement_ids || (principalMovId ? [principalMovId] : []);

        if (allMovIds.length > 0) {
            console.log(`Tracing ${allMovIds.length} linked treasury movements...`);

            for (const movId of allMovIds) {
                // Delete applications linked to this movement
                const { data: apps } = await supabase.from('aplicaciones_pago').select('*').eq('movimiento_id', movId);
                if (apps && apps.length > 0) {
                    for (const app of apps) {
                        await supabase.from('aplicaciones_pago').delete().eq('id', app.id);
                        console.log(`Wiped application: ${app.id}`);

                        // Revert invoice
                        if (app.comprobante_id) {
                            await supabase.from('comprobantes').update({ estado: 'pendiente' }).eq('id', app.comprobante_id);
                            console.log(`Reverted invoice back to pending: ${app.comprobante_id}`);
                        }
                    }
                }

                // Track instruments and delete
                const { data: ins } = await supabase.from('instrumentos_pago').select('id').eq('movimiento_id', movId);
                if (ins && ins.length > 0) {
                    for (const i of ins) {
                        await supabase.from('instrumentos_pago').delete().eq('id', i.id);
                        console.log(`Wiped instrument: ${i.id}`);
                    }
                }

                // Delete movement
                await supabase.from('movimientos_tesoreria').delete().eq('id', movId);
                console.log(`Wiped treasury movement: ${movId}`);
            }
        }

        // Also look for floating instruments that might have been tied to TRF-MIXED-123 just in case
        const { data: floatingIns } = await supabase.from('instrumentos_pago').select('*').ilike('referencia', '%TRF-MIXED-123%');
        if (floatingIns && floatingIns.length > 0) {
            console.log(`Found ${floatingIns.length} floating instruments with reference TRF-MIXED-123`);
            for (const fi of floatingIns) {
                await supabase.from('instrumentos_pago').delete().eq('id', fi.id);
                console.log(`Wiped floating instrument: ${fi.id}`);
            }
        }

        // Finally, DELETE the bank transaction itself so it disappears from the list
        await supabase.from('transacciones').delete().eq('id', tx.id);
        console.log(`Wiped bank transaction: ${tx.id}`);
    }

    console.log('--- WIPE COMPLETE ---');
}

nukeMixedTx();
