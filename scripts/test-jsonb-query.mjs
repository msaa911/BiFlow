import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

function getEnvProps() {
    const envFile = fs.readFileSync('.env.local', 'utf8')
    const env = {}
    envFile.split('\n').forEach(line => {
        const parts = line.split('=')
        if (parts.length > 1) {
            env[parts[0]] = parts.slice(1).join('=').trim().replace(/['"]/g, '')
        }
    })
    return env
}

async function run() {
    const env = getEnvProps()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const supabase = createClient(supabaseUrl, supabaseKey)

    // First let's get any valid organization ID from the db
    const { data: members } = await supabase.from('organization_members').select('*').limit(1)

    if (!members || members.length === 0) {
        console.error("No organization members found to test with")
        return
    }

    const orgId = members[0].organization_id
    console.log("Using orgId:", orgId)

    // Try to insert manually with the same logic the API does
    const { data: importLog, error: adminErr } = await supabase
        .from('archivos_importados')
        .insert({
            organization_id: orgId,
            nombre_archivo: 'test_local_script_client.xlsx',
            estado: 'completado',
            metadata: {
                context: 'cliente',
                processed: 10,
                inserted: 10
            }
        })
        .select()
        .single()

    if (adminErr) {
        console.error("Insertion failed:", adminErr)
    } else {
        console.log("Insertion succeeded:", importLog.id)
    }
}

run().catch(console.error)
