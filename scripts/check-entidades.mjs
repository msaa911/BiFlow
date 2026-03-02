import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const supabase = createClient(envConfig['NEXT_PUBLIC_SUPABASE_URL'], envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'])

async function run() {
    const { data } = await supabase.from('entidades').select('cuit, razon_social')
    console.log("Entidades guardadas:", data)
}
run()
