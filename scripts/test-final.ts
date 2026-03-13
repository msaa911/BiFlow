import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function testFinal() {
    console.log("Searching for voucher of tx a1093a72...")
    const { data: vouchers } = await supabase.from('comprobantes').select('id, nro_factura').ilike('nro_factura', 'BN-A1093A72%')
    
    if (!vouchers || vouchers.length === 0) {
        console.log("No voucher found!")
        return
    }

    const vId = vouchers[0].id
    console.log(`Found voucher ID: ${vId}`)

    const { data: tx, error: txError } = await supabase
        .from('transacciones')
        .update({
            comprobante_id: vId,
            estado: 'conciliado'
        })
        .eq('id', 'a1093a72-438f-449c-9d5c-0141e395c2d4')
        .select()

    if (txError) {
        console.error("TX UPDATE ERROR:", txError)
    } else {
        console.log("TX UPDATE SUCCESS:", tx)
    }
}

testFinal()
