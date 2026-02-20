
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

async function listAllTables() {
    console.log('--- LISTING ALL PUBLIC TABLES ---');
    // Using an RPC that might exist or just trying to guess? 
    // Actually, I can use the `rpc` if the user has a generic one, or just use a query to a table that doesn't exist to get the hint? No.

    // I will try to query a known non-existent table to see if the error message lists available tables in some environments.
    // But better: search if there is an rpc `get_tables` or similar.

    // Since I can't do raw SQL without RPC, I'll try to check for these tables specifically:
    const tablesToCheck = [
        'comprobantes',
        'facturas',
        'invoices',
        'ventas',
        'compras',
        'transacciones',
        'transacciones_revision',
        'hallazgos',
        'configuracion_impuestos',
        'configuracion_empresa',
        'cuentas_bancarias',
        'archivos_importados',
        'memberships',
        'organization_members',
        'organizations'
    ];

    for (const t of tablesToCheck) {
        const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
        if (error) {
            if (error.code === 'PGRST205') {
                // Not found
            } else {
                console.log(`Table ${t}: Error ${error.code} - ${error.message}`);
            }
        } else {
            console.log(`Table ${t}: EXISTS with ${count} rows`);
        }
    }
}

listAllTables();
