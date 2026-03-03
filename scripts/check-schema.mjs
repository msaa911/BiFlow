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
    const { data: cols, error } = await supabase
        .rpc('get_table_columns', { table_name: 'transacciones' })

    if (error) {
        // Fallback: try to select 1 row and see keys
        const { data: oneRow } = await supabase.from('transacciones').select('*').limit(1)
        if (oneRow && oneRow.length > 0) {
            console.log('Columns in transacciones:', Object.keys(oneRow[0]))
        } else {
            console.error('Could not get columns:', error)
        }
        return
    }

    console.log('Columns in transacciones:', cols)
}
run().catch(console.error)
