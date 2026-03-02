const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://bnlmoupgzbtgfgominzd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
);

async function checkValues() {
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';
    const { data: invoices } = await supabase
        .from('comprobantes')
        .select('*')
        .eq('organization_id', orgId)
        .in('tipo', ['factura_venta', 'factura_compra'])
        .neq('estado', 'pagado');

    console.log(`\n--- ALL PENDING INVOICE AMOUNTS ---`);
    for (const inv of invoices.slice(0, 5)) {
        console.log(`ID: ${inv.id.substring(0, 6)}... | Nombre: ${inv.razon_social_socio} | Pendiente: ${inv.monto_pendiente}`);
    }

    // Check if there's any invoice matching 294277
    const exact = invoices.find(i => Math.abs(Number(i.monto_pendiente) - 294277) < 5);
    if (exact) {
        console.log("FOUND EXACT 294277:");
        console.log(exact);
    } else {
        console.log("NO INVOICE HAS 294277 PENDING. The data test generation didn't create an exact match, or it was already reconciled!");
    }
}
checkValues();
