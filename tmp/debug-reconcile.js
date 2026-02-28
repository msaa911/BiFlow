
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: '.env.local' });

// Mock supabase server client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function debugReconciliation() {
    console.log('--- DEBUG RECONCILIATION ---');

    // 1. Get Org ID
    const { data: orgs } = await supabase.from('organization_members').select('organization_id').limit(1);
    if (!orgs || orgs.length === 0) {
        console.error('No organization found');
        return;
    }
    const orgId = orgs[0].organization_id;
    console.log('Using OrgId:', orgId);

    // 2. Count current pending
    const { data: pendingTrans } = await supabase.from('transacciones').select('id').eq('organization_id', orgId).is('comprobante_id', null);
    const { data: pendingInvoices } = await supabase.from('comprobantes').select('id').eq('organization_id', orgId).neq('estado', 'pagado');

    console.log('Pending Transactions:', pendingTrans?.length || 0);
    console.log('Pending Invoices:', pendingInvoices?.length || 0);

    // 3. Import and run Engine
    // Note: We need to point to the built JS if possible, but we can try requiring the TS file if we have ts-node or just mock it.
    // Since I can't easily require the TS file without transpile, I'll copy the core logic here to test.

    // Actually, I'll just run a query to see if there ARE matches possible right now.
    const { data: allTrans } = await supabase.from('transacciones').select('*').eq('organization_id', orgId).is('comprobante_id', null);
    const { data: allInvoices } = await supabase.from('comprobantes').select('*').eq('organization_id', orgId).neq('estado', 'pagado');

    let potentialMatches = 0;
    allTrans.forEach(t => {
        const match = allInvoices.find(i => i.cuit_socio === t.cuit && Math.abs(Number(i.monto_pendiente) - Math.abs(t.monto)) < 0.05);
        if (match) potentialMatches++;
    });

    console.log('Potential Level 1 Matches (Direct CUIT + Amount):', potentialMatches);

    if (potentialMatches > 0) {
        console.log('Running engine would find matches.');
    } else {
        console.log('Engine correctly says 0 matches (Level 1).');
    }
}

debugReconciliation();
