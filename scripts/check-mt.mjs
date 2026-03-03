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

const supabase = createClient(url, key)

async function run() {
    const { data: oneRow, error } = await supabase.from('movimientos_tesoreria').select('*').limit(1)
    if (error) {
        console.error('Error reaching movimientos_tesoreria:', error)
    } else {
        console.log('Columns in movimientos_tesoreria:', Object.keys(oneRow[0] || {}))
    }
}
run().catch(console.error)
