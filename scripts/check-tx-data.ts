
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTable() {
    const { data, error } = await supabase
        .from('transacciones')
        .select('*')
        .limit(5)

    if (error) {
        console.error('Error:', error)
        return
    }

    console.log('Sample data:', JSON.stringify(data, null, 2))
}

checkTable()
