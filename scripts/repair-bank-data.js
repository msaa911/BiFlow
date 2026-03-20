const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function repairData() {
  console.log('--- Starting Data Repair [Bank Sync] ---');

  // 1. Get Orphan Transactions
  const { data: orphans, error: errOrphans } = await supabase
    .from('transacciones')
    .select('id, created_at, descripcion, monto')
    .is('cuenta_id', null)
    .order('created_at', { ascending: true });

  if (errOrphans) {
    console.error('Error fetching orphans:', errOrphans);
    return;
  }

  console.log(`Found ${orphans.length} orphan transactions.`);

  // 2. Get Bank Imports from specific dates (March 8 and March 20)
  const { data: imports, error: errImports } = await supabase
    .from('archivos_importados')
    .select('id, nombre_archivo, cuenta_id, created_at')
    .ilike('nombre_archivo', '%extracto%')
    .order('created_at', { ascending: true });

  if (errImports) {
    console.error('Error fetching imports:', errImports);
    return;
  }

  console.log(`Found ${imports.length} bank import records.`);

  // 3. Logic: Match by proximity of created_at
  // We'll iterate through orphans and find the closest import that happened BEFORE them (within a reasonable window).
  let updateCount = 0;
  for (const tx of orphans) {
    const txTime = new Date(tx.created_at).getTime();
    
    // Find imports that happened within 12 hours BEFORE the transaction
    const candidate = [...imports].reverse().find(imp => {
      const impTime = new Date(imp.created_at).getTime();
      const diff = txTime - impTime;
      return diff >= -5000 && diff < 43200000; // 12 hours window (-5s for safety)
    });

    if (candidate && candidate.cuenta_id) {
      console.log(`Matching TX [${tx.id}] to Import [${candidate.nombre_archivo}] -> Account [${candidate.cuenta_id}]`);
      
      const { error: updErr } = await supabase
        .from('transacciones')
        .update({
          cuenta_id: candidate.cuenta_id,
          archivo_importacion_id: candidate.id
        })
        .eq('id', tx.id);
      
      if (updErr) {
        console.error(`Failed to update TX ${tx.id}:`, updErr.message);
      } else {
        updateCount++;
      }
    } else {
      console.warn(`No match found for TX [${tx.id}] created at ${tx.created_at}`);
    }
  }

  console.log(`\n--- Repair Finished ---`);
  console.log(`Successfully updated ${updateCount} / ${orphans.length} transactions.`);
}

repairData();
