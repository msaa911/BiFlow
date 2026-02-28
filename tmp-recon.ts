import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { ReconciliationEngine } from './lib/reconciliation-engine';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// Using service role to bypass RLS if needed, but ANON works if RLS allows or if we just want to test logic. 
// Wait, the engine itself uses `createClient` from `@/lib/supabase/server` which we can't easily mock here without setting up Next.js context. 

// Actually, ReconciliationEngine.autoReconcile takes the supabase client as an argument!
// autoReconcile(supabase: any, orgId: string)

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching test org...");
    const { data: orgs } = await supabase.from('organizaciones').select('id').limit(1);
    if (!orgs || orgs.length === 0) {
        console.log("No orgs found");
        return;
    }
    const realOrgId = orgs[0].id;
    console.log("Running auto-reconcile for org:", realOrgId);

    try {
        const result = await ReconciliationEngine.autoReconcile(supabase, realOrgId);
        console.log("Reconciliation Result:", result);
    } catch (e) {
        console.error("Error during reconciliation:", e);
    }
}
run();
