import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function tryUpdate() {
    const txId = "a1093a72-438f-449c-9d5c-0141e395c2d4"
    const { data, error } = await supabase
        .from('transacciones')
        .update({
            estado: 'conciliado',
            categoria: 'Gastos Bancarios',
            comprobante_id: '15d38ccb-703a-449b-90e6-590fb0dfb927' // The voucher ID from previous check
        })
        .eq('id', txId)
        .select()

    if (error) {
        console.error("ERROR:", error)
        return
    }

    console.log("SUCCESS:", JSON.stringify(data, null, 2))
}

tryUpdate()
