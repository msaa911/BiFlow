import fs from 'fs';
import fetch from 'node-fetch';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/);
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    return acc;
}, {});

const SUPABASE_URL = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envConfig.SUPABASE_SERVICE_ROLE_KEY;

async function inspectFunctions() {
    console.log(`Inspecting PostgREST schema for: ${SUPABASE_URL}`);
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const data = await response.json();
        
        console.log('--- VISIBLE PATHS ---');
        if (!data.paths) {
            console.error('Error: schema data does not have paths property. Response:', JSON.stringify(data, null, 2));
            return;
        }
        
        const rpcs = Object.keys(data.paths).filter(p => p.startsWith('/rpc/'));
        console.log(`Found ${rpcs.length} total RPCs.`);
        
        const v4 = rpcs.filter(r => r.includes('reconcile_v4_0'));
        if (v4.length > 0) {
            console.log('SUCCESS: reconcile_v4_0 found:', v4);
            console.log('Details for reconcile_v4_0:', JSON.stringify(data.paths['/rpc/reconcile_v4_0'], null, 2));
            
        } else {
            console.log('FAILURE: reconcile_v4_0 NOT found in active paths.');
            const suggested = rpcs.filter(r => r.includes('reconcile'));
            console.log('Other reconcile RPCs:', suggested);
        }
        
    } catch (err) {
        console.error('Error during inspection:', err.message);
    }
}

inspectFunctions();
