const fs = require('fs');

async function compileAndTest() {
    const tsCode = fs.readFileSync('./lib/reconciliation-engine.ts', 'utf-8');

    // Quick regex replacement to make it valid JS for this local run
    let jsCode = tsCode
        .replace(/import .* from .*/g, '')
        .replace(/export class/g, 'class')
        .replace(/: any\[\]/g, '')
        .replace(/: string\[\]/g, '')
        .replace(/: any/g, '')
        .replace(/: string/g, '')
        .replace(/: number/g, '')
        .replace(/<.*>/g, '') // remove generics
        .replace(/as any/g, '');

    jsCode = `
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            'https://bnlmoupgzbtgfgominzd.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
        );
        ${jsCode}
        
        // Mock createClient
        class MockEngine extends ReconciliationEngine {
             // Override just to use our local supabase instance
        }
        
        async function run() {
            try {
                // Hardcode org ID
                const result = await ReconciliationEngine.matchAndReconcile.toString().replace('await createClient()', 'supabase');
                eval(\`ReconciliationEngine.matchAndReconcile = \${result}\`);
                console.log(await ReconciliationEngine.matchAndReconcile('8bca8172-b23f-4da7-b50c-ba2fd78187ac'));
            } catch(e) {
                console.error(e);
            }
        }
        run();
    `;

    fs.writeFileSync('./scripts/run-engine-js.js', jsCode);
}
compileAndTest();
