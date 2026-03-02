import { ReconciliationEngine } from '../lib/reconciliation-engine';

async function run() {
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';
    try {
        console.log("TESTING RECON ENGINE IN TYPESCRIPT...");
        console.log("Has URL?", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
        console.log("Has SERVICE_KEY?", !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY));

        const result = await ReconciliationEngine.matchAndReconcile(orgId);
        console.log("RESULT:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("FATAL ERROR:", e);
    }
}

run();
