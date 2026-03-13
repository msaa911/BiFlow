import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkVoucher() {
    const { data, error } = await supabase
        .from('comprobantes')
        .select('*')
        .ilike('nro_factura', 'BN-A1093A72%')

    if (error) {
        console.error(error)
        return
    }

    console.log(JSON.stringify(data, null, 2))
}

checkVoucher()
