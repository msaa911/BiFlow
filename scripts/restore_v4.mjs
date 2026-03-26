import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('Reading migration file phase 2...');
  const sql = fs.readFileSync('supabase/migrations/20260324_phase2_rpc_logic.sql', 'utf8');
  
  console.log('Applying migration via execute_sql_internal (service role)...');
  const { data, error } = await supabase.rpc('execute_sql_internal', { sql_query: sql });
  
  if (error) {
    console.error('CRITICAL ERROR applying migration:', error.message);
    if (error.message.includes('execute_sql_internal')) {
        console.log('Hint: execute_sql_internal RPC is missing. I cannot apply SQL directly via JS client.');
    }
    process.exit(1);
  }
  
  console.log('Migration applied successfully!');
  
  // Also apply Phase 3 just in case? 
  // User said Fases 1, 2, 3 are completed, so I'll trust they might be partially missing.
  // Actually, I'll just do Phase 2 first.
}

applyMigration();
