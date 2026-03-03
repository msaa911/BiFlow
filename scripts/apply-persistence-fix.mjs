import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY // Actually service_role in this setup

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function applySql() {
    console.log('Reading migration file...')
    const sql = fs.readFileSync('./supabase/migrations/20260303_fix_tax_rules_persistence.sql', 'utf8')

    console.log('Applying SQL via exec_sql...')
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error('SQL Error:', error)
        process.exit(1)
    } else {
        console.log('SQL Applied Success')
    }
}

applySql()
