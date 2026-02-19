
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

async function listTables() {
    const { data, error } = await supabase.from('organizations').select('id').limit(1); // Just to test connection
    if (error) {
        console.error('Connection error:', error);
        return;
    }

    console.log('Querying schema...');
    // There is no direct "list tables" in Supabase JS without RPC or raw SQL
    // But I can try to query common tables I think exist
    const potentialTables = [
        'configuracion_impuestos',
        'configuracion_impuesto',
        'tax_configs',
        'impuestos_config',
        'configuracion_empresa'
    ];

    for (const table of potentialTables) {
        const { error } = await supabase.from(table).select('id').limit(1);
        if (error && error.code === 'PGRST204') {
            console.log(`Table ${table} exists (empty) or 204 returned.`);
        } else if (error && error.code === 'PGRST205') {
            console.log(`Table ${table} DOES NOT exist.`);
        } else if (error) {
            console.log(`Table ${table} returned error code: ${error.code}`);
        } else {
            console.log(`Table ${table} exists!`);
        }
    }
}

listTables();
