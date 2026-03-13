
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://bnlmoupgzbtgfgominzd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data } = await supabase.from('movimientos_tesoreria').select('*').limit(1);
    if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
        console.log('Sample row:', data[0]);
    }
}
check();
