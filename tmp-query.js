const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const s = createClient(urlMatch[1].trim().replace(/['"]/g, ''), keyMatch[1].trim().replace(/['"]/g, ''));

async function run() {
    const { data: trans, error: err1 } = await s.from('transacciones').select('id, descripcion, monto, fecha, cuit, comprobante_id, metadata').is('comprobante_id', null).order('fecha', { ascending: false }).limit(10);
    const { data: comps, error: err2 } = await s.from('comprobantes').select('id, tipo, cuit_socio, monto_pendiente, monto_total, fecha_emision, estado').neq('estado', 'pagado').order('fecha_emision', { ascending: false }).limit(50);
    console.dir({ Trans: trans, TransError: err1, Comps: comps, CompsError: err2 }, { depth: null });
}
run();
