const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://bnlmoupgzbtgfgominzd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
);

// 1. Fetch pending invoices (AP/AR)
async function test() {
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';
    const { data: invoices } = await supabase
        .from('comprobantes')
        .select('*')
        .eq('organization_id', orgId)
        .in('tipo', ['factura_venta', 'factura_compra'])
        .neq('estado', 'pagado');

    const { data: trans } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .eq('estado', 'pendiente');

    console.log(`Invoices: ${invoices.length}, Pending Trans: ${trans.length}`);

    // Let's just manually try to match the first 5 transactions
    for (const t of trans.slice(0, 5)) {
        const tAmount = Math.abs(Number(t.monto));
        console.log(`\nEvaluating Trans: ${t.descripcion} | Monto: ${tAmount}`);

        // Find exact amount matches
        const exactMatches = invoices.filter(i => Math.abs(Number(i.monto_pendiente) - tAmount) < 0.05);

        if (exactMatches.length > 0) {
            console.log(`  -> FOUND EXACT AMOUNT MATCH(ES):`);
            exactMatches.forEach(em => {
                console.log(`     - Inv: ${em.numero} | CUIT: ${em.cuit_socio} | Name: ${em.razon_social_socio}`);
            });

            // Check fuzzy name
            const words = exactMatches[0].razon_social_socio.toLowerCase().split(' ').filter(w => w.length > 3);
            if (words.length > 0 && t.descripcion.toLowerCase().includes(words[0])) {
                console.log(`     -> FUZZY NAME MATCH SUCCESS: '${words[0]}' found in description.`);
            } else {
                console.log(`     -> FUZZY NAME MATCH FAILED. Words:`, words);
            }

        } else {
            console.log(`  -> No exact amount match. Attempting subset sum...`);
        }
    }
}
test();
