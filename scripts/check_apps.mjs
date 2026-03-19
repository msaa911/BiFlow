import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkApps() {
    const { data: userData } = await supabase.from('organization_members').select('organization_id').limit(1);
    const orgId = userData[0].organization_id;

    console.log('--- Verificando Aplicaciones de Pago ---');

    const { count, data } = await supabase.from('aplicaciones_pago').select('*, comprobantes(nro_factura), movimientos_tesoreria(id, tipo, monto_total)', { count: 'exact' }).eq('organization_id', orgId);
    
    console.log('Total Aplicaciones:', count);
    if (data && data.length > 0) {
        console.table(data.slice(0, 10).map(a => ({
            id: a.id,
            factura: a.comprobantes?.nro_factura,
            mov_total: a.movimientos_tesoreria?.monto_total,
            monto_aplicado: a.monto_aplicado,
            created_at: a.created_at
        })));
    }
}

checkApps();
