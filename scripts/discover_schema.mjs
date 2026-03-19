
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const getEnv = (key) => envContent.split('\n').find(l => l.startsWith(key))?.split('=')[1]?.trim();

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

async function listColumns(tableName) {
    console.log(`Listing columns for table: ${tableName}...`);
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=*&limit=1`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        const data = await response.json();
        if (data.length > 0) {
            console.log(`Columns in ${tableName}:`, Object.keys(data[0]));
        } else {
            // Try dummy insert to see columns in error or response
            const response2 = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({})
            });
            const data2 = await response2.json();
            if (data2 && !data2.code) {
                console.log(`Columns in ${tableName} (via dummy):`, Object.keys(data2[0] || data2));
            } else {
                console.log(`Error/Response for ${tableName}:`, data2);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

const table = process.argv[2] || 'comprobantes';
listColumns(table);
