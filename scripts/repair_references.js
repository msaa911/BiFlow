const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Read environment
const envContent = fs.readFileSync('.env.local', 'utf8');
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1];
const supabase = createClient(url, key);

async function repairData() {
    console.log('--- Iniciando reparación de datos de Tesorería ---');
    
    // Read the CSV
    const csvPath = path.join(process.cwd(), 'test_data', 'recibos.csv');
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',');
    
    const rows = lines.slice(1).map(line => {
        const parts = line.split(',');
        return {
            recibo: parts[1],
            concepto: parts[4],
            detalle: parts[5], // The real check number
            monto: parseFloat(parts[6])
        };
    });

    console.log(`Leídas ${rows.length} filas del CSV.`);

    for (const row of rows) {
        if (!row.detalle || row.detalle.length < 5) continue;

        // Try to find the matching movement in DB
        // We match by concept in observations and amount
        const { data: movements } = await supabase
            .from('movimientos_tesoreria')
            .select('id, observaciones, instrumentos_pago(id, detalle_referencia)')
            .eq('monto', row.monto)
            .ilike('observaciones', `%${row.concepto}%`);

        if (movements && movements.length > 0) {
            for (const mov of movements) {
                const instrument = mov.instrumentos_pago?.[0];
                if (instrument && instrument.detalle_referencia !== row.detalle) {
                    console.log(`Actualizando instrumento ${instrument.id}: ${instrument.detalle_referencia} -> ${row.detalle}`);
                    await supabase
                        .from('instrumentos_pago')
                        .update({ detalle_referencia: row.detalle })
                        .eq('id', instrument.id);
                }
            }
        }
    }
    
    console.log('--- Reparación finalizada ---');
}

repairData().catch(console.error);
