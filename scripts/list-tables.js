
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

async function listTables() {
    console.log("--- LISTING TABLES IN PUBLIC SCHEMA ---");
    const { data, error } = await supabase.rpc('get_tables_list');

    if (error) {
        // Fallback if RPC doesn't exist: attempt to query pg_catalog via raw SQL if possible
        // Actually, let's try a simple query to a known meta table
        console.log("RPC get_tables_list failed, trying direct select...");
        const { data: tables, error: err2 } = await supabase.from('transacciones').select('id').limit(1);
        if (err2) console.error("Base check failed:", err2.message);
        else console.log("Can see 'transacciones' table.");

        const { data: taxRules, error: err3 } = await supabase.from('reglas_fiscales_ia').select('id').limit(1);
        if (err3) console.error("Cannot see 'reglas_fiscales_ia' table:", err3.message);
        else console.log("Can see 'reglas_fiscales_ia' table.");
    } else {
        console.log("Tables:", data);
    }
}

listTables();
