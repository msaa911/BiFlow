import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkTx() {
    const { data, error } = await supabase
        .from('transacciones')
        .select('*')
        .ilike('descripcion', '%COMISION MANTENIMIENTO CUENTA%')
        .order('fecha', { ascending: false })
        .limit(5)

    if (error) {
        console.error(error)
        return
    }

    console.log(JSON.stringify(data, null, 2))
}

checkTx()
