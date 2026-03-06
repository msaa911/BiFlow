
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkColumns() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'transacciones' })
    if (error) {
        // If RPC doesn't exist, try a simple query and check keys
        console.log('RPC check failed, trying sample query...')
        const { data: sample } = await supabase.from('transacciones').select('*').limit(1).single()
        if (sample) {
            console.log('Columnas encontradas:', Object.keys(sample).join(', '))
        }
    } else {
        console.log('Columnas (RPC):', data)
    }
}

checkColumns()
