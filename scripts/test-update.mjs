import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function testUpdate() {
    // Pick the first transaction ID we found earlier
    const testId = '8b112d38-476d-43f3-9ae2-e0b30b3fde95'

    console.log(`Attempting to update transaction ${testId} to 'conciliado'...`)

    const { data, error } = await supabase
        .from('transacciones')
        .update({
            estado: 'conciliado',
            metadata: { test: 'reconciliation_manual_fix' }
        })
        .eq('id', testId)
        .select()

    if (error) {
        console.error('UPDATE ERROR:', error)
    } else {
        console.log('UPDATE SUCCESS:', data)
    }
}

testUpdate()
