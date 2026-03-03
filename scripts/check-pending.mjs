import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
    const { data: compData, error: compErr } = await supabase
        .from('comprobantes')
        .select('id, numero, estado, metadata')
        .eq('estado', 'pagado')

    if (compErr) {
        console.error(compErr)
        return
    }

    const linkedTxIds = compData.map(comp => comp.metadata?.transaccion_id).filter(id => !!id)

    if (linkedTxIds.length === 0) {
        console.log('No paid invoices have linked transaction IDs.')
        return
    }

    const { data: txData, error: txErr } = await supabase
        .from('transacciones')
        .select('id, descripcion, monto, estado, movimiento_id')
        .in('id', linkedTxIds)

    if (txErr) {
        console.error(txErr)
        return
    }

    console.log(`Analyzing ${txData.length} linked transactions:`)
    txData.forEach(tx => {
        console.log(`- Tx: ${tx.descripcion} | State: ${tx.estado} | MovId: ${tx.movimiento_id}`)
    })
}

check()
