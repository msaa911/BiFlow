import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY)

async function checkFunction() {
    console.log('Checking for function reconcile_v4_0...');
    
    // We try to call it with a dry_run to see if it even exists
    const { data, error } = await supabase.rpc('reconcile_v4_0', {
        p_org_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
        p_cuenta_id: null,
        p_dry_run: true
    });

    if (error) {
        console.error('RPC Error:', error.message);
        console.error('Error Code:', error.code);
        console.error('Hint:', error.hint);
    } else {
        console.log('RPC Success! Function exists and reachable.');
        console.log('Result:', data);
    }

    // Also check for v3_1 as fallback
    console.log('\nChecking for function reconcile_v3_1...');
    const { error: errorV3 } = await supabase.rpc('reconcile_v3_1', {
        p_org_id: '00000000-0000-0000-0000-000000000000',
        p_dry_run: true
    });
    if (errorV3) {
        console.error('RPC V3_1 Error:', errorV3.message);
    } else {
        console.log('RPC V3_1 exists.');
    }
}

checkFunction();
