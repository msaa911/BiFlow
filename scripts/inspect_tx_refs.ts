
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectTransactions() {
    console.log('--- Inspeccionando Transacciones Bancarias ---')
    const { data: txs, error } = await supabase
        .from('transacciones')
        .select('*')
        .limit(10)

    if (error) {
        console.error('Error:', error)
        return
    }

    txs?.forEach(tx => {
        console.log(`ID: ${tx.id}`)
        console.log(`Descripción: ${tx.descripcion}`)
        console.log(`Cheque: ${tx.numero_cheque}`)
        console.log(`Metadata: ${JSON.stringify(tx.metadata, null, 2)}`)
        console.log('---')
    })
}

inspectTransactions()
