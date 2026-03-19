
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const getEnv = (key) => envContent.split('\n').find(l => l.startsWith(key))?.split('=')[1]?.trim();

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

async function testColumn(tableName, colName) {
    console.log(`Checking column '${colName}' in ${tableName}...`);
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=${colName}&limit=1`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const data = await response.json();
        if (response.ok) {
            console.log(`OK: Column '${colName}' exists.`);
        } else {
            console.log(`FAIL: Column '${colName}' error:`, data.message);
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

async function run() {
    await testColumn('comprobantes', 'numero');
    await testColumn('comprobantes', 'nro_factura');
    await testColumn('movimientos_tesoreria', 'numero');
    await testColumn('movimientos_tesoreria', 'nro_comprobante');
}

run();
