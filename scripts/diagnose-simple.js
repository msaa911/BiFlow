const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function diagnose() {
    try {
        console.log('--- DIAGNOSTIC START ---');
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

        console.log('Fetching last 5 invoices...');
        const { data, error } = await supabase
            .from('comprobantes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) {
            console.error('Error fetching data:', error);
            return;
        }

        data.forEach((inv, i) => {
            console.log(`\n--- Invoice ${i + 1} ---`);
            console.log('KEYS:', Object.keys(inv));
            console.log('VALUES:', {
                nro_factura: inv.nro_factura,
                numero: inv.numero,
                razon: inv.razon_social_entidad || inv.razon_social_socio,
                created_at: inv.created_at
            });
        });

        console.log('\n--- DIAGNOSTIC END ---');
    } catch (err) {
        console.error('Diagnostic failed:', err);
    }
}

diagnose();
