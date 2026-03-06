const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function repair() {
    try {
        console.log('--- REPAIR START ---');
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

        console.log('Fetching all invoices with missing nro_factura or numero...');
        const { data: invoices, error } = await supabase
            .from('comprobantes')
            .select('id, nro_factura, numero')
            .or('nro_factura.is.null,numero.is.null');

        if (error) {
            console.error('Error fetching invoices:', error);
            return;
        }

        console.log(`Found ${invoices.length} invoices to potentially repair.`);

        let repairCount = 0;
        for (const inv of invoices) {
            const val = inv.nro_factura || inv.numero;
            if (val && (inv.nro_factura !== inv.numero)) {
                const { error: updateError } = await supabase
                    .from('comprobantes')
                    .update({
                        nro_factura: val,
                        numero: val
                    })
                    .eq('id', inv.id);

                if (!updateError) {
                    repairCount++;
                } else {
                    console.error(`Error repairing invoice ${inv.id}:`, updateError.message);
                }
            }
        }

        console.log(`Successfully repaired ${repairCount} invoices.`);
        console.log('--- REPAIR END ---');
    } catch (err) {
        console.error('Repair failed:', err);
    }
}

repair();
