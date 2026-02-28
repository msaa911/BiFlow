const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const s = createClient(urlMatch[1].trim().replace(/['"]/g, ''), keyMatch[1].trim().replace(/['"]/g, ''));

async function testMatch() {
    const { data: trans } = await s.from('transacciones').select('*').is('comprobante_id', null);
    const { data: comps } = await s.from('comprobantes').select('*').in('tipo', ['factura_venta', 'factura_compra']).neq('estado', 'pagado');

    console.log(`Unlinked Bank Trans: ${trans.length}`);
    console.log(`Unpaid Invoices: ${comps.length}`);

    if (trans.length && comps.length) {
        const t = trans[0];
        console.log('Sample Trans:', { id: t.id, monto: Math.abs(Number(t.monto)), cuit: t.cuit, desc: t.descripcion });
        const targetInvoices = comps.filter(i => i.cuit_socio === t.cuit);
        console.log(`Invoices for that CUIT (${t.cuit}):`, targetInvoices.map(i => ({ id: i.id, monto_pendiente: i.monto_pendiente, cuit: i.cuit_socio })));

        const singleMatch = targetInvoices.find(i => Math.abs(Number(i.monto_pendiente) - Math.abs(Number(t.monto))) < 0.05);
        console.log('Match Found?', !!singleMatch);
    }
}
testMatch();
