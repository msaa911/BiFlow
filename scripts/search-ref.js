
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://bnlmoupgzbtgfgominzd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ";
const supabase = createClient(supabaseUrl, supabaseKey);

async function findGlobal() {
    console.log('--- GLOBAL SEARCH FOR 484455 ---');
    
    // Check transacciones
    const { data: txs } = await supabase.from('transacciones').select('*').ilike('descripcion', '%484455%');
    console.log('Found in Transacciones:', txs ? txs.length : 0);
    if (txs && txs.length > 0) console.log('Tx Sample:', txs[0].descripcion);

    // Check movimientos_tesoreria
    const { data: movs } = await supabase.from('movimientos_tesoreria').select('*');
    const matchedMovs = movs.filter(m => 
        (m.nro_comprobante && m.nro_comprobante.includes('484455')) ||
        (m.observaciones && m.observaciones.includes('484455')) ||
        (m.concepto && m.concepto.includes('484455'))
    );
    console.log('Found in Movimientos:', matchedMovs.length);

    // Check instrumentos_pago
    const { data: insts } = await supabase.from('instrumentos_pago').select('*');
    const matchedInsts = insts.filter(i => i.detalle_referencia && i.detalle_referencia.includes('484455'));
    console.log('Found in Instrumentos:', matchedInsts.length);

    // Check comprobantes
    const { data: comps } = await supabase.from('comprobantes').select('*');
    const matchedComps = comps.filter(c => c.numero && c.numero.includes('484455'));
    console.log('Found in Comprobantes:', matchedComps.length);
}
findGlobal();
