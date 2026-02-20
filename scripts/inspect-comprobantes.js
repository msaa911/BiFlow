
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

async function inspectComprobantes() {
    console.log('--- INSPECTING COMPROBANTES ---');
    const { data: comprobantes, error } = await supabase
        .from('comprobantes')
        .select('id, organization_id, razon_social_socio, numero, monto_total')
        .limit(20);

    if (error) {
        console.error('Error fetching comprobantes:', error);
    } else {
        console.log('Sample Comprobantes:');
        comprobantes.forEach(c => {
            console.log(`[${c.organization_id}] | ${c.id.substring(0, 8)} | ${c.razon_social_socio} | ${c.numero} | $${c.monto_total}`);
        });
    }

    console.log('\n--- CHECKING ORGANIZATIONS ---');
    const { data: orgs } = await supabase.from('organizations').select('id, name');
    orgs.forEach(o => {
        console.log(`Org: ${o.id} | Name: ${o.name}`);
    });
}

inspectComprobantes();
