import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import dotenv from 'dotenv'

async function applyFix() {
    console.log('--- APPLYING COMPROBANTES SCHEMA FIX ---')

    const env = readFileSync('.env.local', 'utf-8');
    const config = dotenv.parse(env);

    const supabase = createClient(
        config.NEXT_PUBLIC_SUPABASE_URL,
        config.SUPABASE_SERVICE_ROLE_KEY
    );

    const sqlFile = 'supabase/migrations/20260312_fix_comprobantes_columns.sql';
    console.log(`Reading SQL from ${sqlFile}...`);
    const sql = readFileSync(sqlFile, 'utf-8');

    console.log('Attempting to apply migrations via RPC exec_sql...')
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error('RPC exec_sql failed:', error.message)
        console.log('SQL being executed was:', sql)
    } else {
        console.log('Migration applied successfully!')
        console.log('Response:', data);
    }
}

applyFix()
