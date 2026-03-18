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
        const { data: invoices, error: invErr } = await supabase.from('comprobantes').select('*').limit(1);
        if (invErr) console.error('Inv error:', invErr);
        if (invoices?.[0]) console.log('COMPROBANTES ROW:', invoices[0]);

        console.log('\nFetching 1 treasury movement...');
        const { data: movs, error: movErr } = await supabase.from('movimientos_tesoreria').select('*').limit(1);
        if (movErr) console.error('Mov error:', movErr);
        if (movs?.[0]) console.log('MOVIMIENTOS ROW:', movs[0]);

        console.log('\nFetching 1 payment application...');
        const { data: apps, error: appErr } = await supabase.from('aplicaciones_pago').select('*').limit(1);
        if (appErr) console.error('App error:', appErr);
        if (apps?.[0]) console.log('APLICACIONES ROW:', apps[0]);

        console.log('\n--- SCHEMA DEBUG END ---');
    } catch (err) {
        console.error('Debug failed:', err);
    }
}

debugSchema();
