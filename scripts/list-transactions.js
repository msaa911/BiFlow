
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

const ORG_ID = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

async function listTransactions() {
    console.log(`--- TRANSACTIONS FOR ORG: ${ORG_ID} ---`);
    const { data, error } = await supabase
        .from('transacciones')
        .select('id, fecha, descripcion, monto, tags')
        .eq('organization_id', ORG_ID)
        .order('fecha', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log(`Transactions found: ${data.length}`);
        console.log(JSON.stringify(data, null, 2));
    }
}

listTransactions();
