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
    console.log('--- INSPECCIÓN FINAL INSTRUMENTOS ---')
    const { data, error } = await supabase
        .from('instrumentos_pago')
        .select('*')
        .eq('monto', 371280)

    if (error) {
        console.error('Error:', error)
        return
    }

    if (data && data.length > 0) {
        // Log keys only first to be 100% sure
        console.log('COLUMNAS:', Object.keys(data[0]).join(', '))
        // Log the record
        data.forEach(r => {
            console.log('RECORD ID:', r.id)
            console.log('REF:', r.referencia)
            console.log('DET_REF:', r.detalle_referencia)
            console.log('BANCO:', r.banco)
            console.log('ESTADO:', r.estado)
        })
    } else {
        console.log('No se encontró el instrumento de $371.280')
    }
}

run().catch(console.error)
