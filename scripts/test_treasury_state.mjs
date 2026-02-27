import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testTreasuryUpload() {
    console.log("Fetching test org...");
    const { data: member } = await supabase.from('organization_members').select('organization_id, user_id').limit(1).single();

    if (!member) {
        console.log("No member found");
        return;
    }

    console.log(`Checking if any movements exist for org ${member.organization_id}`);
    const { data: movs } = await supabase.from('movimientos_tesoreria')
        .select('id, numero, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log("Latest Treasury Movements:");
    console.log(JSON.stringify(movs, null, 2));

    const { data: files } = await supabase.from('archivos_importados')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log("Latest Uploads in DB:");
    console.log(JSON.stringify(files.map(f => ({ name: f.nombre_archivo, state: f.estado, time: f.created_at })), null, 2));
}

testTreasuryUpload();
