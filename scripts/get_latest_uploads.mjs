import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: files, error } = await supabase
        .from('archivos_importados')
        .select('id, nombre_archivo, estado, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Failed to fetch files:", error);
        return;
    }

    console.log("LAST 5 UPLOADS:");
    console.log(JSON.stringify(files, null, 2));
}

run();
