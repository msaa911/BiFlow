import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function clean() {
    // Delete orphaned comprobantes (no archivo_importacion_id)
    const { data, error } = await supabase
        .from('comprobantes')
        .delete()
        .is('archivo_importacion_id', null)
        .select('id');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Deleted ${data?.length || 0} orphaned comprobantes`);
}

clean();
