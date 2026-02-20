
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkGhostData() {
    console.log('--- Checking Comprobantes (Treasury Data) ---')
    const { data, error } = await supabase
        .from('comprobantes')
        .select('id, organization_id, razon_social_socio, numero, estado')
        .limit(10)

    if (error) {
        console.error('Error fetching comprobantes:', error)
    } else {
        console.table(data)
    }

    console.log('\n--- Checking Organizations ---')
    const { data: orgs } = await supabase.from('organizations').select('id, name')
    console.table(orgs)
}

checkGhostData()
