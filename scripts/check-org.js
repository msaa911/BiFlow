const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://bnlmoupgzbtgfgominzd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
);

async function checkOrg() {
    // 1. Get user by email
    const { data: users, error: selError } = await supabase.auth.admin.listUsers();

    if (selError) { console.error(selError); return; }

    const targetUser = users.users.find(u => u.email === 'miguelhsaa@gmail.com');
    if (!targetUser) {
        console.log("miguelhsaa not found");
        return;
    }

    // 2. Check their org
    const { data: member } = await supabase.from('organization_members').select('*').eq('user_id', targetUser.id);
    console.log("Miguelhsaa is in Org:", JSON.stringify(member, null, 2));
}

checkOrg();
