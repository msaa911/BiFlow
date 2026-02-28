const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const s = createClient(urlMatch[1].trim().replace(/['"]/g, ''), keyMatch[1].trim().replace(/['"]/g, ''));

async function inspectMatches() {
    const { data: orgs } = await s.from('organization_members').select('organization_id').limit(1);
    if (!orgs || !orgs.length) return console.log('No orgs found');
    const orgId = orgs[0].organization_id;

    const { data: trans } = await s.from('transacciones').select('id, descripcion, monto, fecha, cuit, metadata').is('comprobante_id', null).eq('organization_id', orgId);
    const { data: comps } = await s.from('comprobantes').select('id, tipo, razon_social_socio, cuit_socio, monto_pendiente, monto_total, fecha_emision').in('tipo', ['factura_venta', 'factura_compra']).neq('estado', 'pagado').eq('organization_id', orgId);

    console.log(`Unlinked Trans: ${trans.length}, Unpaid Comps: ${comps.length}`);
    if (trans.length > 0 && comps.length > 0) {
        // Find one reason why a typical pair isn't matching
        const sampleComp = comps[0];
        console.log('\n--- Sample Comp ---', sampleComp);

        // Find transactions with same CUIT
        const relatedTransByCuit = trans.filter(t => t.cuit === sampleComp.cuit_socio);
        console.log(`\n--- Trans with same CUIT (${sampleComp.cuit_socio}) ---`);
        relatedTransByCuit.forEach(t => console.log(`Trans ID: ${t.id}, Monto: ${t.monto}, Abs Monto: ${Math.abs(t.monto)}`));

        // Find transactions with exact amount
        const relatedTransByAmount = trans.filter(t => Math.abs(t.monto) === Math.abs(sampleComp.monto_pendiente));
        console.log(`\n--- Trans with same Amount (${sampleComp.monto_pendiente}) ---`);
        relatedTransByAmount.forEach(t => console.log(`Trans ID: ${t.id}, CUIT: ${t.cuit}, Desc: ${t.descripcion}`));

    }
}
inspectMatches();
