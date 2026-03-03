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
    console.log("Checking pending data consistency...")

    // 1. Get unique CUITs from pending invoices
    const { data: invoices } = await supabase
        .from('comprobantes')
        .select('cuit_socio, razon_social_socio')
        .eq('estado', 'pendiente')

    const uniqueCuits = [...new Set(invoices.map(i => i.cuit_socio))].filter(Boolean)
    console.log(`Unique CUITs in pending invoices: ${uniqueCuits.length}`)

    // 2. Check if these CUITs exist in 'entidades'
    if (uniqueCuits.length > 0) {
        const { data: entities } = await supabase
            .from('entidades')
            .select('cuit, razon_social')
            .in('cuit', uniqueCuits)

        const foundCuits = entities.map(e => e.cuit)
        const missing = uniqueCuits.filter(c => !foundCuits.includes(c))

        console.log(`Found ${entities.length} entities out of ${uniqueCuits.length} required.`)
        if (missing.length > 0) {
            console.warn('Missing entities for CUITs:', missing)
        }
    }
}
run().catch(console.error)
