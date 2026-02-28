import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { runAnalysis } from '../lib/analysis/engine.js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';
    console.log('--- Verification Start ---');

    try {
        // 1. Run Analysis
        console.log('Running analysis...');
        const result = await runAnalysis(orgId);
        console.log('Analysis Result:', result);

        // 2. Check hallazgos for the 8.5M invoice
        console.log('Checking findings...');
        const { data: findings, error } = await supabase
            .from('hallazgos')
            .select('*, comprobantes(*)')
            .eq('organization_id', orgId)
            .eq('tipo', 'monto_inusual');

        if (error) {
            console.error('Error fetching findings:', error);
            return;
        }

        console.log(`Found ${findings.length} unusual amount findings.`);
        const invoiceFinding = findings.find(f => f.comprobante_id && f.comprobantes?.monto_total === 8500000);

        if (invoiceFinding) {
            console.log('SUCCESS: Found the 8.5M invoice anomaly!');
            console.log('Finding Detail:', JSON.stringify(invoiceFinding.detalle, null, 2));
        } else {
            console.log('FAILURE: Could not find the 8.5M invoice anomaly.');
            console.log('Available Findings:', JSON.stringify(findings.map(f => ({ id: f.id, monto: f.comprobante_id ? f.comprobantes?.monto_total : 'N/A' })), null, 2));
        }
    } catch (e) {
        console.error('Execution Error:', e);
    }
}

verify();
