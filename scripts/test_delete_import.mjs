import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDelete() {
    const id = "4d5877cf-3d74-4865-805d-4fd0b01fed98";
    console.log(`Attempting to delete file: ${id}`);

    // 1. Check if we can find treasury movements
    console.log("Looking for treasury movements...");
    const { data: treasuryMovs, error: tmErr } = await supabase
        .from('movimientos_tesoreria')
        .select('id, metadata')
        .contains('metadata', { archivo_importacion_id: id });

    if (tmErr) {
        console.error("Error querying treasury movements:", tmErr);
        // Continue anyway to see if delete fails
    } else {
        console.log(`Found ${treasuryMovs?.length || 0} treasury movements.`);
    }

    // 2. Try deleting the file record itself
    console.log("Deleting archivos_importados...");
    const { error: logError } = await supabase
        .from('archivos_importados')
        .delete()
        .eq('id', id);

    if (logError) {
        console.error(`DB Error deleting file record:`, logError);
    } else {
        console.log("Successfully deleted file record.");
    }
}

testDelete();
