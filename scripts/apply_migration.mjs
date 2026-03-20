import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  const sql = fs.readFileSync('supabase/migrations/20260320_fix_invoice_reconciliation_status.sql', 'utf8');
  
  // Split by common separators if needed, but since it's a small file we can try direct RPC if possible
  // or a simple query.
  
  const { data, error } = await supabase.rpc('execute_sql_internal', { sql_query: sql });
  
  if (error) {
    // If execute_sql_internal doesn't exist, we might have to use a different approach
    // In many Supabase setups, you'd use the CLI. But here I don't have it.
    // I will try to run it via a simple postgres query if the client allows it (it doesn't directly).
    
    // BACKUP PLAN: Run it via the console or assume the user will apply it?
    // NO, I can use a more direct approach if the DB allows it.
    console.error('Error applying migration via RPC:', error);
    process.exit(1);
  }
  
  console.log('Migration applied successfully!');
}

applyMigration();
