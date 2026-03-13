import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkVoucher() {
    const { data, error } = await supabase
        .from('comprobantes')
        .select('*')
        .eq('nro_factura', 'AUTO-a1093a72')

    if (error) {
        console.error(error)
        return
    }

    console.log(JSON.stringify(data, null, 2))
}

checkVoucher()
