
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://bnlmoupgzbtgfgominzd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- CHECKING INSTRUMENTS ---');
    const { data, error } = await supabase.from('instrumentos_pago').select('*').not('detalle_referencia', 'is', null).limit(10);
    console.log('Instruments with Ref:', data);
    
    console.log('--- CHECKING MOVEMENTS METADATA ---');
    const { data: movs } = await supabase.from('movimientos_tesoreria').select('id, nro_comprobante, metadata').limit(5);
    console.log('Movs Metadata:', JSON.stringify(movs, null, 2));
}
check();
