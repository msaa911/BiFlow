const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://bnlmoupgzbtgfgominzd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
);

async function testCircuit() {
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

    // We already know from our earlier test that TX b7911078-5929-48c1-adc0-5ad3230a5246 
    // matches Invoice 647e0c8a-adf3-4824-8f4d-dae934144325 exactly.
    // Let's run the exact insertion circuit that the backend runs.

    console.log("Starting circuit test...");

    const { data: trans } = await supabase.from('transacciones').select('*').eq('id', 'b7911078-5929-48c1-adc0-5ad3230a5246').single();
    const { data: inv } = await supabase.from('comprobantes').select('*').eq('id', '647e0c8a-adf3-4824-8f4d-dae934144325').single();

    if (!trans || !inv) {
        console.log("Could not find test data");
        return;
    }

    try {
        const transAmount = Math.abs(Number(trans.monto));
        const isCobro = trans.monto > 0;

        console.log("1. Fetching Entity...");
        const { data: entity, error: entityErr } = await supabase
            .from('entidades')
            .select('id')
            .eq('organization_id', orgId)
            .eq('cuit', inv.cuit_socio)
            .single();

        if (entityErr) throw new Error("EntityErr: " + JSON.stringify(entityErr));

        console.log("2. Inserting Movimiento Tesoreria...");
        const { data: movimiento, error: movError } = await supabase
            .from('movimientos_tesoreria')
            .insert({
                organization_id: orgId,
                entidad_id: entity.id,
                tipo: isCobro ? 'cobro' : 'pago',
                fecha: trans.fecha,
                monto_total: transAmount,
                observaciones: `TEST AUTO: ${trans.descripcion}`,
                metadata: { transaccion_id: trans.id, auto: true, level: 1 }
            })
            .select()
            .single();

        if (movError) throw new Error("MovError: " + JSON.stringify(movError));

        console.log("3. Inserting Instrumento Pago...");
        const { error: insError } = await supabase
            .from('instrumentos_pago')
            .insert({
                movimiento_id: movimiento.id,
                metodo: 'transferencia',
                monto: transAmount,
                fecha_disponibilidad: trans.fecha,
                banco: trans.banco,
                referencia: trans.descripcion,
                estado: 'acreditado'
            });

        if (insError) throw new Error("InsError: " + JSON.stringify(insError));

        console.log("4. Inserting Aplicacion Pago...");
        const { error: appError } = await supabase
            .from('aplicaciones_pago')
            .insert({
                movimiento_id: movimiento.id,
                comprobante_id: inv.id,
                monto_aplicado: transAmount
            });

        if (appError) throw new Error("AppError: " + JSON.stringify(appError));

        console.log("SUCCESS! The circuit works.");

        // Cleanup test data
        await supabase.from('movimientos_tesoreria').delete().eq('id', movimiento.id);

    } catch (e) {
        console.error("CRASH IN CIRCUIT:", e.message);
    }
}

testCircuit();
