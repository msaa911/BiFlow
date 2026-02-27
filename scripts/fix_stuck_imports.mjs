import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixStuckRecords() {
    // 1. Find all 'procesando' records  
    const { data: stuck } = await supabase
        .from('archivos_importados')
        .select('id, nombre_archivo, created_at')
        .eq('estado', 'procesando');

    console.log(`Found ${stuck?.length || 0} stuck records:`);
    stuck?.forEach(f => console.log(`  - ${f.nombre_archivo} (${f.id}) created ${f.created_at}`));

    // 2. Check which ones actually have treasury movements  
    for (const f of (stuck || [])) {
        const { data: movs } = await supabase
            .from('movimientos_tesoreria')
            .select('id')
            .contains('metadata', { archivo_importacion_id: f.id });

        const movsCount = movs?.length || 0;

        if (movsCount > 0) {
            // Has data, mark as completado
            console.log(`  ${f.nombre_archivo}: Found ${movsCount} movements → marking COMPLETADO`);
            await supabase.from('archivos_importados').update({
                estado: 'completado',
                metadata: { inserted: movsCount, context: 'treasury_fix' }
            }).eq('id', f.id);
        } else {
            // No data, mark as error (these are the failed ones)
            console.log(`  ${f.nombre_archivo}: No movements → marking ERROR`);
            await supabase.from('archivos_importados').update({
                estado: 'error',
                metadata: { note: 'Import failed - no data inserted', fixed_by: 'diagnostic_script' }
            }).eq('id', f.id);
        }
    }

    console.log("\nDone! Re-checking state:");
    const { data: files } = await supabase
        .from('archivos_importados')
        .select('nombre_archivo, estado, metadata')
        .order('created_at', { ascending: false })
        .limit(5);

    files?.forEach(f => console.log(`  ${f.nombre_archivo}: ${f.estado}`));
}

fixStuckRecords();
