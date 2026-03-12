import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

async function diagnose() {
    try {
        console.log('--- DIAGNOSTIC START ---');
        const env = readFileSync('.env.local', 'utf-8');
        const config = dotenv.parse(env);

        const supabase = createClient(
            config.NEXT_PUBLIC_SUPABASE_URL,
            config.SUPABASE_SERVICE_ROLE_KEY
        );

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

        if (!data || data.length === 0) {
            console.log('No invoices found.');
            return;
        }

        data.forEach((inv, i) => {
            console.log(`\n--- Invoice ${i + 1} ---`);
            console.log('RAW KEYS:', Object.keys(inv));
            console.log('DATA:', {
                id: inv.id,
                nro_factura: inv.nro_factura,
                numero: inv.numero,
                razon_social_socio: inv.razon_social_socio,
                nombre_entidad: inv.nombre_entidad,
                razon_social_entidad: inv.razon_social_entidad,
                cuit_socio: inv.cuit_socio,
                cuit_entidad: inv.cuit_entidad,
                concepto: inv.concepto,
                created_at: inv.created_at
            });
        });

        console.log('\n--- DIAGNOSTIC END ---');
    } catch (err) {
        console.error('Diagnostic failed:', err);
    }
}

diagnose();
