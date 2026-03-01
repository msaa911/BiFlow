const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://bnlmoupgzbtgfgominzd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
);

async function debugReconciliation() {
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

    // 1. Fetch pending invoices
    const { data: pendingInvoices, error: invError } = await supabase
        .from('comprobantes')
        .select('*')
        .eq('organization_id', orgId)
        .in('tipo', ['factura_venta', 'factura_compra', 'nota_debito', 'nota_credito', 'ingreso_vario', 'egreso_vario'])
        .neq('estado', 'pagado')
        .order('fecha_vencimiento', { ascending: true });

    console.log("=== INVOICES ===");
    if (invError) console.error(invError);
    else {
        console.log(`Found ${pendingInvoices?.length || 0} pending invoices.`);
        if (pendingInvoices && pendingInvoices.length > 0) {
            console.log("Sample Invoice:", JSON.stringify(pendingInvoices[0], null, 2));
        }
    }

    // 2. Fetch unlinked transactions
    const { data: pendingTrans, error: transError } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .eq('estado', 'pendiente');

    console.log("\n=== TRANSACTIONS ===");
    if (transError) console.error(transError);
    else {
        console.log(`Found ${pendingTrans?.length || 0} unlinked transactions.`);
        if (pendingTrans && pendingTrans.length > 0) {
            console.log("Sample Transaction:", JSON.stringify(pendingTrans[0], null, 2));
        }
    }
}

debugReconciliation();
