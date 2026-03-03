import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const url = envConfig['NEXT_PUBLIC_SUPABASE_URL']
const key = envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY']

console.log('Connecting to Supabase URL:', url)
const supabase = createClient(url, key)

async function run() {
    const { data: trans, error } = await supabase
        .from('transacciones')
        .select('id, descripcion, monto, estado, monto_usado, movimiento_id')
        .limit(20)

    if (error) {
        console.error('Error fetching transactions:', error)
        return
    }

    if (!trans) {
        console.warn('No data returned (null)')
        return
    }

    console.log(`Transacciones totales encontradas (limit 20): ${trans.length}`)

    trans.forEach(t => {
        console.log(`  [${t.estado}] ${t.descripcion} | $${t.monto}`)
    })

    const { data: counts, error: countErr } = await supabase
        .from('transacciones')
        .select('*', { count: 'exact', head: true })

    if (countErr) {
        console.error('Error fetching counts:', countErr)
    } else {
        console.log(`Total records in transacciones table: ${counts?.length || 0} (head count)`)
    }

    // Check specific counts for pendiente/conciliado
    const { count: pendCount } = await supabase.from('transacciones').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente')
    const { count: concCount } = await supabase.from('transacciones').select('*', { count: 'exact', head: true }).eq('estado', 'conciliado')

    console.log(`Summary: Pendiente: ${pendCount}, Conciliado: ${concCount}`)
}
run().catch(console.error)
