import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSchema() {
    console.log('Checking columns for table: comprobantes...')
    const { data, error } = await supabase
        .from('comprobantes')
        .select('*')
        .limit(1)

    if (error) {
        console.error('Error fetching data:', error)
    } else if (data && data.length > 0) {
        console.log('Columns found:', Object.keys(data[0]))
    } else {
        console.log('Table is empty, trying to get columns via RPC if possible or another method...')
        // Try to get at least one row or check information_schema via a trick if RLS allows
        const { data: cols, error: colError } = await supabase.rpc('get_table_columns', { table_name: 'comprobantes' })
        if (colError) {
            console.log('RPC failed or not exists. Trying a simple insert that fails to see columns...')
        } else {
            console.log('Columns from RPC:', cols)
        }
    }
}

checkSchema()
