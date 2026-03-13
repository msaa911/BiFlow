
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://bnlmoupgzbtgfgominzd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ";
const supabase = createClient(supabaseUrl, supabaseKey);

async function deepClean() {
    console.log('--- STARTING DEEP CLEAN OF ORPHANED VOUCHERS ---');
    
    // 1. Fetch all pending transactions
    const { data: pendingTxs, error: txError } = await supabase
        .from('transacciones')
        .select('*')
        .eq('estado', 'pendiente');
    
    if (txError) {
        console.error('Error fetching pending txs:', txError);
        return;
    }

    console.log(`Found ${pendingTxs.length} pending transactions.`);

    // 2. Fetch all vouchers (comprobantes) that are bank notes
    const { data: vouchers, error: vError } = await supabase
        .from('comprobantes')
        .select('id, metadata');
    
    if (vError) {
        console.error('Error fetching vouchers:', vError);
        return;
    }

    let fixedCount = 0;

    for (const tx of pendingTxs) {
        // Find if any voucher points to this transaction
        const matchingVoucher = vouchers.find(v => 
            v.metadata && (v.metadata.bank_transaction_id === tx.id || v.metadata.transaccion_id === tx.id)
        );

        if (matchingVoucher) {
            console.log(`Matching found! Tx ${tx.id.slice(0,8)} has Voucher ${matchingVoucher.id.slice(0,8)}`);
            console.log(`Updating Tx ${tx.id} to 'conciliado'...`);
            
            const { error: updateError } = await supabase
                .from('transacciones')
                .update({
                    estado: 'conciliado',
                    comprobante_id: matchingVoucher.id,
                    metadata: {
                        ...(tx.metadata || {}),
                        reconciled_at: new Date().toISOString(),
                        repaired_by: 'deep_clean_script',
                        linked_voucher_id: matchingVoucher.id
                    }
                })
                .eq('id', tx.id);
            
            if (updateError) {
                console.error(`Failed to update Tx ${tx.id}:`, updateError);
            } else {
                console.log(`Successfully fixed Tx ${tx.id}`);
                fixedCount++;
            }
        }
    }

    console.log(`--- CLEANUP FINISHED. Fixed ${fixedCount} transactions. ---`);
}

deepClean();
