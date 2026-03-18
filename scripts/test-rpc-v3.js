const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function testRPC() {
    const envText = fs.readFileSync('.env.local', 'utf-8');
    const config = {};
    envText.split('\n').forEach(l => {
        const p = l.split('=');
        if (p.length >= 2) config[p[0].trim()] = p.slice(1).join('=').trim();
    });

    const supabase = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

    // Get an org id
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
    if (!orgs || orgs.length === 0) {
        console.log('No organizations found');
        return;
    }
    const orgId = orgs[0].id;

    console.log(`Testing RPC reconcile_v3_1 for org: ${orgId} (Dry Run: true)`);
    
    const { data, error } = await supabase.rpc('reconcile_v3_1', {
        p_org_id: orgId,
        p_dry_run: true
    });

    if (error) {
        console.error('RPC Error:', error);
    } else {
        console.log('RPC Results:', JSON.stringify(data, null, 2));
    }
}

testRPC();
