
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

async function forcePurge() {
    const orgId = "8bca8172-b23f-4da7-b50c-ba2fd78187ac";
    console.log(`--- FORCE PURGING ORG: ${orgId} ---`);

    const tables = [
        'hallazgos',
        'hallazgos_auditoria',
        'comprobantes',
        'configuracion_impuestos',
        'transacciones',
        'transacciones_revision',
        'archivos_importados'
    ];

    for (const table of tables) {
        console.log(`Deleting from ${table}...`);
        const { error } = await supabase.from(table).delete().eq('organization_id', orgId);
        if (error) {
            console.error(`Error deleting from ${table}:`, error);
        } else {
            console.log(`Successfully cleared ${table}`);
        }
    }

    console.log('--- PURGE COMPLETE ---');
}

forcePurge();
