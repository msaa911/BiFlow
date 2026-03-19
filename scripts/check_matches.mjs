import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkMatches() {
    const { data: userData } = await supabase.from('organization_members').select('organization_id').limit(1);
    const orgId = userData[0].organization_id;

    console.log('--- Buscando matches potenciales ---');

    // Movimientos por tipo
    const { data: movCounts } = await supabase.rpc('debug_get_counts', { t_name: 'movimientos_tesoreria', p_org_id: orgId });
    // Note: I don't have debug_get_counts normally, let's just query.
    
    const { data: mTypes } = await supabase.from('movimientos_tesoreria').select('tipo').eq('organization_id', orgId);
    const mTypeCounts = mTypes.reduce((acc, curr) => {
        acc[curr.tipo] = (acc[curr.tipo] || 0) + 1;
        return acc;
    }, {});
    console.log('Movimientos por tipo:', mTypeCounts);

    const { data: cTypes } = await supabase.from('comprobantes').select('tipo, estado').eq('organization_id', orgId);
    const cTypeCounts = cTypes.reduce((acc, curr) => {
        const key = `${curr.tipo} (${curr.estado})`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    console.log('Comprobantes por tipo y estado:', cTypeCounts);

    // Intentar encontrar un match manual para un movimiento tipo 'cobro'
    const { data: oneCobro } = await supabase.from('movimientos_tesoreria').select('entidad_id, monto_total').eq('organization_id', orgId).eq('tipo', 'cobro').limit(1);
    
    if (oneCobro && oneCobro[0]) {
        const { entidad_id, monto_total } = oneCobro[0];
        console.log(`\nBuscando comprobantes para un Cobro de monto ${monto_total} y entidad ${entidad_id}...`);
        
        const { data: possibleComps } = await supabase.from('comprobantes')
            .select('id, tipo, monto_total, entidad_id, estado')
            .eq('organization_id', orgId)
            .eq('entidad_id', entidad_id)
            .in('tipo', ['factura_venta', 'nota_debito_venta']);
            
        console.log('Comprobantes de la misma entidad:', possibleComps.length);
        console.table(possibleComps.map(pv => ({ ...pv, match_monto: ROUND(ABS(pv.monto_total)) === ROUND(ABS(monto_total)) })));
    }
}

function ROUND(num) {
    return Math.round(num);
}
function ABS(num) {
    return Math.abs(num);
}

checkMatches();
