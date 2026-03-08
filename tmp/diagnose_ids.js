
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log('--- Checking Bank Accounts ---');
    const { data: accounts } = await supabase.from('cuentas_bancarias').select('id, banco_nombre, cbu');
    console.log(JSON.stringify(accounts, null, 2));

    console.log('\n--- Checking Latest Transactions ---');
    const { data: txs } = await supabase.from('transacciones')
        .select('id, descripcion, cuenta_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
    console.log(JSON.stringify(txs, null, 2));

    console.log('\n--- Count by cuenta_id ---');
    const { data: counts } = await supabase.rpc('run_query', {
        query_text: "SELECT cuenta_id, count(*) FROM transacciones GROUP BY cuenta_id"
    });

    if (counts) {
        console.log(JSON.stringify(counts, null, 2));
    } else {
        // Simple select if RPC fails
        console.log('Counting manually...');
        const { data: allTxs } = await supabase.from('transacciones').select('cuenta_id');
        const summary = {};
        allTxs?.forEach(t => {
            summary[t.cuenta_id] = (summary[t.cuenta_id] || 0) + 1;
        });
        console.log(summary);
    }
}

diagnose();
