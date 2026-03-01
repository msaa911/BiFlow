const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function debugFullRecon() {
    // Read the actual typescript engine and compile it locally to JS for testing
    let tsCode = fs.readFileSync('./lib/reconciliation-engine.ts', 'utf-8');

    // Compile basic TS to JS
    let jsCode = tsCode
        .replace(/import .* from .*/g, '')
        .replace(/export class/g, 'class')
        .replace(/<.*>|:\s*any\[\]|:\s*any|:\s*string|:\s*number|as\s*any/g, ''); // Crude type stripping

    // Write a temp file that exports the class without TS
    fs.writeFileSync('./scripts/temp-engine.js', `
        ${jsCode}
        module.exports = { ReconciliationEngine };
    `);

    // Load it
    const { ReconciliationEngine } = require('./temp-engine.js');

    // Patch createClient for our script
    ReconciliationEngine.matchAndReconcile = eval(
        ReconciliationEngine.matchAndReconcile.toString()
            .replace('await createClient()', `
                (require('@supabase/supabase-js')).createClient(
                    'https://bnlmoupgzbtgfgominzd.supabase.co',
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
                )
            `)
    );

    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';
    try {
        console.log("=== STARTING FULL RECONCILIATION RUN ===");
        const result = await ReconciliationEngine.matchAndReconcile(orgId);
        console.log("=== FINAL RESULT ===");
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("=== CRASHED ===");
        console.error(e);
    }
}

debugFullRecon();
