import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAppsTotal() {
    const { data: userData } = await supabase.from('organization_members').select('organization_id').limit(1);
    const orgId = userData[0].organization_id;

    const { count, error } = await supabase.from('aplicaciones_pago').select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Total Aplicaciones en BD:', count);

    // Ver si hay movimientos de tesorería sin aplicación
    const { count: pendingMovs } = await supabase.from('movimientos_tesoreria')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .not('id', 'in', (
            // Subquery equivalent in client-side check or just query applications first
            await supabase.from('aplicaciones_pago').select('movimiento_id').eq('organization_id', orgId)
        ).data?.map(a => a.movimiento_id) || []);
    
    console.log('Movimientos de Tesorería sin aplicación:', pendingMovs);
}

checkAppsTotal();
