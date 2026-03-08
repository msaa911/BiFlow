
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkColumns() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'comprobantes' })
    if (error) {
        // If RPC doesn't exist, try a simple select with limit 0
        const { data: cols, error: err } = await supabase.from('comprobantes').select('*').limit(1)
        if (err) {
            console.error('Error:', err)
        } else if (cols && cols.length >= 0) {
            console.log('Columns found:', Object.keys(cols[0] || {}))
        }
    } else {
        console.log('Columns:', data)
    }
}

checkColumns()
