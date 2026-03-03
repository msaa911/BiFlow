const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

async function checkPolicies() {
    console.log('--- CHECKING POLICIES FOR tax_intelligence_rules ---');
    const { data, error } = await supabase.rpc('get_policies', { table_name: 'tax_intelligence_rules' });

    if (error) {
        console.log('Direct RPC failed, trying pg_policies...');
        const { data: pgData, error: pgError } = await supabase
            .from('pg_policies')
            .select('*')
            .eq('tablename', 'tax_intelligence_rules');

        if (pgError) {
            console.error('Failed to query pg_policies:', pgError.message);
        } else {
            console.log('Policies found:', pgData);
        }
    } else {
        console.log('Policies:', data);
    }
}

checkPolicies();
