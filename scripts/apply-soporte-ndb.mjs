import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260302_soporte_ndb_ncb.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    console.log('Applying migration: Soporte NDB/NCB...')

    // Note: Since we don't have a direct exec_sql function exposed via RPC by default in some setups,
    // we try to use a common pattern or instructions for the user. 
    // However, I will try to use the 'rpc' if it exists or explain the manual step.

    const { error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error('Error applying migration via RPC:', error.message)
        console.log('\n--- MANUAL ACTION REQUIRED ---')
        console.log('Please run the following SQL in your Supabase SQL Editor:')
        console.log(sql)
        console.log('------------------------------\n')
    } else {
        console.log('Migration applied successfully!')
    }
}

applyMigration()
