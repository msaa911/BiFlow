import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugNoteTraceability() {
    console.log('--- Fetching latest bank notes ---')
    // First fetch notes
    const { data: notes, error: notesError } = await supabase
        .from('comprobantes')
        .select('*')
        .in('tipo', ['ndb_bancaria', 'ncb_bancaria'])
        .order('created_at', { ascending: false })
        .limit(5)

    if (notesError) {
        console.error('Error fetching notes:', notesError)
        return
    }

    for (const note of notes) {
        console.log(`Note ID: ${note.id}`)
        console.log(`Nro Factura: ${note.nro_factura}`)
        console.log(`Monto: ${note.monto_total}`)
        console.log(`Metadata:`, JSON.stringify(note.metadata, null, 2))

        // Manual check for transaction link
        const { data: txs, error: txError } = await supabase
            .from('transacciones')
            .select('*')
            .eq('comprobante_id', note.id)

        if (txError) {
            console.error(`Error fetching transactions for note ${note.id}:`, txError)
        } else {
            console.log(`Linked Transactions count: ${txs?.length || 0}`)
            txs?.forEach((tx, idx) => {
                console.log(`  Tx ${idx + 1}: ID=${tx.id}, Desc=${tx.descripcion}, Comprobante ID in TX=${tx.comprobante_id}`)
            })
        }
        console.log('---')
    }
}

debugNoteTraceability()
