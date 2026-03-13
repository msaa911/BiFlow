
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://bnlmoupgzbtgfgominzd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ";
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTreasury() {
    console.log('--- INSPECTING TREASURY DATA FOR "Innovaciones Digitales SRL" ---');
    
    // Find entity first
    const { data: entities } = await supabase.from('entidades').select('id, razon_social').ilike('razon_social', '%Innovaciones%');
    if (!entities || entities.length === 0) {
        console.log('Entity not found');
        return;
    }
    
    const entId = entities[0].id;
    console.log(`Found Entity: ${entities[0].razon_social} (${entId})`);

    // Fetch movements
    const { data: movs } = await supabase
        .from('movimientos_tesoreria')
        .select('*, entidades(razon_social)')
        .eq('entidad_id', entId)
        .order('fecha', { ascending: false })
        .limit(10);

    for (const mov of movs) {
        console.log(`\nMovement: ${mov.tipo} - ${mov.nro_comprobante} - Date: ${mov.fecha}`);
        console.log(`Observaciones: ${mov.observaciones}`);
        
        // Fetch instruments
        const { data: insts } = await supabase
            .from('instrumentos_pago')
            .select('*')
            .eq('movimiento_id', mov.id);
        
        if (insts) {
            insts.forEach(ins => {
                console.log(`  > Instrument: ${ins.metodo} | Ref: ${ins.detalle_referencia} | Amount: ${ins.monto} | Metadata: ${JSON.stringify(ins.metadata)}`);
            });
        }
    }
}

inspectTreasury();
