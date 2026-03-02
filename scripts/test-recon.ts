import { createClient } from '@supabase/supabase-js'
import { ReconciliationEngine } from '../lib/reconciliation-engine'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: orgs } = await supabase.from('organizaciones').select('id').limit(1)
    if (!orgs || orgs.length === 0) return;
    const orgId = orgs[0].id
    console.log("Org ID:", orgId)
    const result = await ReconciliationEngine.matchAndReconcile(supabase, orgId, { dryRun: false })
    console.log("Final Result:", result)
}

run().catch(console.error)
