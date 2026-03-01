const { createClient } = require('@supabase/supabase-js');
const { ReconciliationEngine } = require('./lib/reconciliation-engine');

async function testFullAutoReconcile() {
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';
    try {
        console.log("Starting full test...");
        // This will now print our verbose errors
        const result = await ReconciliationEngine.matchAndReconcile(orgId);
        console.log("Result:", result);
    } catch (e) {
        console.error("Crash:", e);
    }
}

testFullAutoReconcile();
