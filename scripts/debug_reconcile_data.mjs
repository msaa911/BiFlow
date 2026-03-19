import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debugData() {
    const { data: userData } = await supabase.from('organization_members').select('organization_id').limit(1);
    const orgId = userData[0].organization_id;

    console.log('--- Resumen para Org:', orgId, '---');

    const { count: movCount } = await supabase.from('movimientos_tesoreria').select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
    console.log('Movimientos Tesorería:', movCount);

    const { count: compCount } = await supabase.from('comprobantes').select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
    console.log('Comprobantes:', compCount);

    // Muestra algunos movimientos y comprobantes para comparar entidad_id y montos
    const { data: movs } = await supabase.from('movimientos_tesoreria').select('id, tipo, monto_total, entidad_id').eq('organization_id', orgId).limit(5);
    console.log('\nMuestra de Movimientos:');
    console.table(movs);

    const { data: comps } = await supabase.from('comprobantes').select('id, tipo, monto_total, entidad_id, estado').eq('organization_id', orgId).limit(5);
    console.log('\nMuestra de Comprobantes:');
    console.table(comps);

    // Verificar si hay registros sin entidad_id
    const { count: movNoEnt } = await supabase.from('movimientos_tesoreria').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).is('entidad_id', null);
    console.log('\nMovimientos sin Entidad:', movNoEnt);

    const { count: compNoEnt } = await supabase.from('comprobantes').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).is('entidad_id', null);
    console.log('Comprobantes sin Entidad:', compNoEnt);
}

debugData();
