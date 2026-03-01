const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://bnlmoupgzbtgfgominzd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
);

async function checkPolicies() {
    const { data, error } = await supabase.rpc('get_table_policies', { table_names: ['movimientos_tesoreria', 'instrumentos_pago', 'aplicaciones_pago', 'transacciones', 'comprobantes'] });

    if (error) {
        // Fallback: run raw SQL using the backend function style if RPC doesn't exist
        console.log("RPC get_table_policies not found on this db. Trying to fetch raw.");
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

async function checkPoliciesRaw() {
    // Assuming postgres directly - let's write a file to execute via bash/psql if we must, 
    // but since we only have REST, we might struggle without an RPC. 
    // Let's just look at the migration files!
}

// Just printing the recent migration files related to Treasury RLS
const fs = require('fs');
const files = fs.readdirSync('./supabase/migrations').filter(f => f.includes('treasury') || f.includes('rls') || f.includes('comprobantes'));
console.log("Relevant Migration Files:", files);

files.slice(-5).forEach(f => {
    console.log(`\n--- ${f} ---`);
    console.log(fs.readFileSync('./supabase/migrations/' + f, 'utf8').substring(0, 500) + '...');
});
