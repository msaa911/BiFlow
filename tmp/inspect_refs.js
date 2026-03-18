const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('--- Inspecting Recent Movements with Refs ---');
    const { data: movs, error } = await supabase
        .from('movimientos_tesoreria')
        .select(`
            id,
            nro_comprobante,
            tipo,
            monto_total,
            fecha,
            entidades (razon_social),
            instrumentos_pago (id, detalle_referencia, metodo, monto)
        `)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching movements:', error);
        return;
    }

    // Filter to find some with egreso/ingreso and instruments
    const filtered = movs.filter(m => m.instrumentos_pago && m.instrumentos_pago.length > 0);
    
    console.log(JSON.stringify(filtered, null, 2));
}

main().catch(console.error);
