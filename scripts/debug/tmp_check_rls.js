
const { createClient } = require('@supabase/supabase-js');
const url = "https://bnlmoupgzbtgfgominzd.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ";
const supabase = createClient(url, key);

async function check() {
    const { data, error } = await supabase.rpc('execute_sql', {
        sql: "SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('transacciones', 'organization_members')"
    });
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}
check();
