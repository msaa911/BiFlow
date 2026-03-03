import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function repair() {
    const { data: movements, error: movError } = await supabase
        .from('movimientos_tesoreria')
        .select('id, metadata')
        .ilike('observaciones', 'AUTO%')

    if (movError) {
        console.error(movError)
        return
    }

    console.log(`Repairing ${movements.length} transactions...`)
    let successCount = 0

    for (const mov of movements) {
        const transId = mov.metadata?.transaccion_id
        if (!transId) continue

        const { error: txError } = await supabase
            .from('transacciones')
            .update({
                estado: 'conciliado',
                movimiento_id: mov.id
            })
            .eq('id', transId)

        if (txError) {
            console.error(`Failed to repair Tx ${transId}:`, txError)
        } else {
            successCount++
        }
    }

    console.log(`Successfully repaired ${successCount} transactions.`)
}

repair()
