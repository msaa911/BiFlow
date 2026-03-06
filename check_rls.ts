import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl!, supabaseKey!)

async function checkRLS() {
    const { data, error } = await supabase.rpc('debug_get_policies', { table_name: 'transacciones' })
    if (error) {
        // Fallback: try raw query if RPC fails
        const { data: rawData, error: rawError } = await supabase.from('pg_policies').select('*').eq('tablename', 'transacciones')
        if (rawError) {
            console.log('Could not fetch policies via SDK, trying another way...')
            console.error(rawError)
            return
        }
        console.log(rawData)
    } else {
        console.log(data)
    }
}

checkRLS()
