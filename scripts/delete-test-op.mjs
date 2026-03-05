import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY)

async function deleteTestOperation() {
    console.log('--- STARTING DELETION OF TEST OPERATION ---');

    // 1. Find the bank transaction
    const { data: txs, error: txErr } = await supabase
        .from('transacciones')
        .select('*')
        .ilike('descripcion', '%DEPOSITO LOTE lt0xhn%');

    if (txErr) {
        console.error('Error finding transaction:', txErr);
        return;
    }

    if (!txs || txs.length === 0) {
        console.log('No transaction found with description "DEPOSITO LOTE lt0xhn"');
        return;
    }

    for (const tx of txs) {
        console.log(`\nFound Transaction: ${tx.id} | ${tx.descripcion} | $${tx.monto} | State: ${tx.estado}`);

        // 2. Find reconciliations linked to this transaction (New Pivot Architecture)
        const principalMovId = tx.movimiento_id;
        const allMovIds = tx.metadata?.all_movement_ids || (principalMovId ? [principalMovId] : []);

        if (allMovIds.length > 0) {
            console.log(`Found ${allMovIds.length} treasury movements linked to this test transaction.`);

            for (const movId of allMovIds) {
                // Delete applications linked to this movement
                const { data: apps } = await supabase.from('aplicaciones_pago').select('*').eq('movimiento_id', movId);
                if (apps && apps.length > 0) {
                    for (const app of apps) {
                        await supabase.from('aplicaciones_pago').delete().eq('id', app.id);
                        console.log(`Deleted application: ${app.id}`);

                        // Check if we need to reset/delete the linked invoice
                        if (app.comprobante_id) {
                            const { data: comp } = await supabase.from('comprobantes').select('*').eq('id', app.comprobante_id).single();
                            if (comp) {
                                if (comp.numero && comp.numero.includes('AUTO-')) {
                                    await supabase.from('comprobantes').delete().eq('id', comp.id);
                                    console.log(`Deleted auto-generated test invoice: ${comp.id}`);
                                } else {
                                    await supabase.from('comprobantes').update({ estado: 'pendiente' }).eq('id', comp.id);
                                    console.log(`Reverted invoice back to pending: ${comp.id}`);
                                }
                            }
                        }
                    }
                }

                // Delete Instruments
                const { data: ins } = await supabase.from('instrumentos_pago').select('id').eq('movimiento_id', movId);
                if (ins && ins.length > 0) {
                    for (const i of ins) {
                        await supabase.from('instrumentos_pago').delete().eq('id', i.id);
                        console.log(`Deleted instrument: ${i.id}`);
                    }
                }

                // Delete treasury movement
                await supabase.from('movimientos_tesoreria').delete().eq('id', movId);
                console.log(`Deleted treasury movement: ${movId}`);
            }
        }

        // 5. Finally, delete the bank transaction
        const { error: delTxErr } = await supabase.from('transacciones').delete().eq('id', tx.id);
        if (delTxErr) {
            console.error(`Error deleting transaction ${tx.id}:`, delTxErr);
        } else {
            console.log(`Successfully deleted bank transaction: ${tx.id}`);
        }
    }

    console.log('\n--- DELETION COMPLETE ---');
}

deleteTestOperation();
