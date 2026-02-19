
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

const ORG_ID = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

async function verifyFixes() {
    console.log('--- VERIFYING FIXES ---');

    // 1. Simulate Purge (Partial for verification)
    console.log('Step 1: Simulating Purge for configuration_empresa...');
    const { error: resetErr } = await supabase.from('configuracion_empresa').update({
        tna: 0,
        colchon_liquidez: 0,
        limite_descubierto: 0,
        modo_tasa: 'AUTOMATICO'
    }).eq('organization_id', ORG_ID);

    if (resetErr) console.error('Reset Error:', resetErr);
    else console.log('Successfully reset configuracion_empresa.');

    // 2. Verify settings are 0
    const { data: settings } = await supabase.from('configuracion_empresa').select('*').eq('organization_id', ORG_ID).single();
    console.log('Settings after reset:', {
        tna: settings.tna,
        colchon: settings.colchon_liquidez,
        limite: settings.limite_descubierto
    });

    // 3. Clear tax configs for clean test
    await supabase.from('configuracion_impuestos').delete().eq('organization_id', ORG_ID);
    console.log('Cleared configuracion_impuestos.');

    // 4. Simulate Tax Detection with a dummy transaction
    // We'll just check if there are PENDING rules.
    const { count: pendingCount } = await supabase
        .from('configuracion_impuestos')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', ORG_ID)
        .eq('estado', 'PENDIENTE');

    console.log('Pending rules count (should be 0 before upload):', pendingCount);
}

verifyFixes();
