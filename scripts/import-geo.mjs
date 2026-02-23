import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
// Native Node environment support used via --env-file

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function importGeoData() {
    const filePath = path.join(process.cwd(), 'lib/localidades.csv')
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    // Skip header
    const dataLines = lines.slice(1).filter(line => line.trim() !== '')

    console.log(`Analyzing ${dataLines.length} rows...`)

    const BATCH_SIZE = 500
    let processed = 0

    for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
        const batch = dataLines.slice(i, i + BATCH_SIZE).map(line => {
            // Simple CSV split (safe for this specific file based on analysis)
            const [localidad, lat, lng, departamento, provincia] = line.split(',')

            return {
                localidad: localidad?.trim(),
                latitud: parseFloat(lat) || null,
                longitud: parseFloat(lng) || null,
                departamento: departamento?.trim(),
                provincia: provincia?.trim()
            }
        })

        const { error } = await supabase
            .from('geo_argentina')
            .insert(batch)

        if (error) {
            console.error(`Error inserting batch ${i / BATCH_SIZE}:`, error)
        } else {
            processed += batch.length
            console.log(`Inserted ${processed} / ${dataLines.length} rows...`)
        }
    }

    console.log('Import completed successfully!')
}

importGeoData().catch(console.error)
