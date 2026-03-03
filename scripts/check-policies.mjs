import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkPolicies() {
    const { data, error } = await supabase
        .rpc('get_table_policies', { table_name: 'transacciones' })

    if (error) {
        console.log('RPC get_table_policies failed, trying raw query via pg_policies if possible...')
        // Fallback: try to just list rules if you have a way, but Supabase doesn't expose pg_policies via REST usually.
        // Let's try to just ADD the policy and see if it works.
        console.error(error)
        return
    }

    console.log('Policies for transacciones:', data)
}

checkPolicies()
