
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://bnlmoupgzbtgfgominzd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('Searching for transaction with ID part: cee31b26');
    // Using raw SQL via RPC or just fetching all and filtering in-memory if needed
    // But let's try a direct match if it's the start
    const { data: allTxs, error: allTxsError } = await supabase
        .from('transacciones')
        .select('*')
        .eq('estado', 'pendiente');
    
    if (allTxsError) {
        console.error('Error fetching tx:', allTxsError);
        return;
    }
    
    const txs = allTxs.filter(tx => tx.id.startsWith('cee31b26'));
    
    console.log('Transactions matching "cee31b26":', txs.length);

    for (const tx of txs) {
        console.log(`\nTx ID: ${tx.id}`);
        console.log(`Estado: ${tx.estado}`);
        console.log(`Comprobante ID: ${tx.comprobante_id}`);
        
        console.log('Checking comprobantes for tx_id:', tx.id);
        const { data: comps, error: compError } = await supabase
            .from('comprobantes')
            .select('*'); // We filter in memory to avoid metadata query issues for now
        
        const filteredComps = comps.filter(c => c.metadata && c.metadata.transaccion_id === tx.id);
        
        console.log('Comprobantes found via metadata:', filteredComps.length);
        if (filteredComps.length > 0) {
            console.log('First comp ID:', filteredComps[0].id);
            console.log('First comp Nro:', filteredComps[0].nro_comprobante);
        }
    }
}

check();
