
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

async function findGhost() {
    const term = 'Ricardo Lopez';
    console.log(`Searching for '${term}' in all relevant tables...`);

    const tables = [
        'comprobantes',
        'transacciones',
        'transacciones_revision',
        'hallazgos',
        'archivos_importados',
        'configuracion_impuestos',
        'configuracion_empresa',
        'cuentas_bancarias'
    ];

    for (const table of tables) {
        // We try to search in any column that might have text
        // Supabase select doesn't have a wildcard search easily, so we query and filter in JS if needed,
        // or we just try a few likely columns.

        let query = supabase.from(table).select('*');

        // Try to match 'razon_social_socio' or 'descripcion'
        if (table === 'comprobantes') query = query.ilike('razon_social_socio', `%${term}%`);
        else if (table === 'transacciones') query = query.ilike('descripcion', `%${term}%`);
        else continue;

        const { data, error } = await query;
        if (error) {
            console.log(`Table ${table} error: ${error.message}`);
        } else if (data && data.length > 0) {
            console.log(`Table ${table} HAS ${data.length} matches!`);
            data.forEach(d => console.log(`- ID: ${d.id}, Org: ${d.organization_id}`));
        } else {
            console.log(`Table ${table} has no matches.`);
        }
    }
}

findGhost();
