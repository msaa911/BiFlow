import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl!, supabaseKey!)

async function checkSpecificTx() {
    const txId = 'be738770-8ae2-4948-913e-cbaf4c65f078'
    console.log(`--- Checking Transaction ${txId} ---`)
    const { data: tx, error } = await supabase
        .from('transacciones')
        .select('*')
        .eq('id', txId)
        .single()

    if (error) {
        console.error('Error:', error)
        return
    }

    console.log(JSON.stringify(tx, null, 2))
}

checkSpecificTx()
