import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line?.toString().replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const url = envConfig['NEXT_PUBLIC_SUPABASE_URL']
const key = envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY']
const supabase = createClient(url, key)

async function run() {
    const search = '00000114'
    console.log(`--- BUSCANDO RECIBO: ${search} ---`)

    const { data: mt, error } = await supabase
        .from('movimientos_tesoreria')
        .select(`
            *,
            instrumentos_pago (
                *
            )
        `)
        .ilike('nro_comprobante', `%${search}%`)

    if (error) {
        console.error('Error:', error)
        return
    }

    console.log('Movimientos encontrados:', JSON.stringify(mt, null, 2))
}

run().catch(console.error)
