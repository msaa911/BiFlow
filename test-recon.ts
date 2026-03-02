import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { ReconciliationEngine } from './lib/reconciliation-engine.ts'
import { createClient } from '@supabase/supabase-js'

async function run() {
    process.env.SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_KEY
    )
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1)
    if (orgs && orgs.length > 0) {
        console.log(`Using organization: ${orgs[0].id}`)
        const result = await ReconciliationEngine.matchAndReconcile(orgs[0].id)
        console.log("Result:", result)
    } else {
        console.log("No organizations found")
    }
}

run()
