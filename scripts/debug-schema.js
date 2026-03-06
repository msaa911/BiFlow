const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function debugSchema() {
    try {
        console.log('--- SCHEMA DEBUG START ---');
        const envText = fs.readFileSync('.env.local', 'utf-8');
        const lines = envText.split('\n');
        const config = {};
        lines.forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                config[parts[0].trim()] = parts.slice(1).join('=').trim();
            }
        });

        const url = config.NEXT_PUBLIC_SUPABASE_URL;
        const key = config.SUPABASE_SERVICE_ROLE_KEY;
        const supabase = createClient(url, key);

        console.log('Fetching 1 invoice to see internal keys...');
        const { data, error } = await supabase
            .from('comprobantes')
            .select('*')
            .limit(1);

        if (error) {
            console.error('Error fetching data:', error);
            return;
        }

        if (data && data.length > 0) {
            console.log('ALL KEYS IN DB RESPONSE:', Object.keys(data[0]));
            console.log('VALUES OF FIRST ROW:', data[0]);
        } else {
            console.log('No data found in comprobantes.');
        }

        console.log('\n--- SCHEMA DEBUG END ---');
    } catch (err) {
        console.error('Debug failed:', err);
    }
}

debugSchema();
