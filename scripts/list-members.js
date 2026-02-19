
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

async function listAllMemberships() {
    console.log('--- LISTING ALL MEMBERSHIPS ---');
    const { data: members, error } = await supabase.from('organization_members').select('*');
    if (error) {
        console.error('Error fetching organization_members:', error);
    } else {
        console.table(members);
    }

    console.log('\n--- LISTING ALL COMPROBANTES ORG IDS ---');
    const { data: compOrgs } = await supabase.from('comprobantes').select('organization_id');
    const uniqueOrgs = [...new Set(compOrgs?.map(c => c.organization_id))];
    console.log('Unique Org IDs in Comprobantes:', uniqueOrgs);
}

listAllMemberships();
