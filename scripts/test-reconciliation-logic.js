const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://bnlmoupgzbtgfgominzd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
);

function findClientByFuzzy(desc, invoices) {
    const normalizedDesc = desc.toLowerCase();
    for (const inv of invoices) {
        if (inv.razon_social_socio) {
            const words = inv.razon_social_socio.toLowerCase().split(' ').filter(w => w.length > 3);
            if (words.length > 0 && normalizedDesc.includes(words[0])) {
                console.log(`[MATCH] Fuzzy match found: '${normalizedDesc}' contains '${words[0]}' -> CUIT ${inv.cuit_socio}`);
                return inv.cuit_socio;
            }
        }
    }
    return null;
}

async function debugMatching() {
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

    const { data: invoices } = await supabase
        .from('comprobantes')
        .select('*')
        .eq('organization_id', orgId)
        .in('tipo', ['factura_venta', 'factura_compra', 'nota_debito', 'nota_credito', 'ingreso_vario', 'egreso_vario'])
        .neq('estado', 'pagado');

    const { data: trans } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .eq('estado', 'pendiente');

    console.log(`Analyzing ${trans.length} TXs vs ${invoices.length} Invoices...`);

    let exactMatches = 0;

    for (const t of trans.slice(0, 5)) { // Look at first 5
        console.log(`\n--- TX: ${t.descripcion} | Monto: ${t.monto} | CUIT Orig: ${t.cuit_origen || t.cuit} ---`);

        const transAmount = Math.abs(Number(t.monto));
        const isCobro = t.monto > 0;
        const targetTipos = isCobro
            ? ['factura_venta', 'nota_debito', 'ingreso_vario']
            : ['factura_compra', 'nota_credito', 'egreso_vario'];

        let targetInvoices = invoices.filter(i => targetTipos.includes(i.tipo));
        console.log(`Found ${targetInvoices.length} invoices of correct type (${targetTipos.join(',')})`);

        let matchLevel = 0;
        let matchedCuit = null;

        if (t.cuit || t.cuit_origen) {
            matchedCuit = t.cuit || t.cuit_origen;
            targetInvoices = targetInvoices.filter(i => i.cuit_socio === matchedCuit);
            matchLevel = 1;
            console.log(`Applying CUIT filter (${matchedCuit}). Remaining invoices: ${targetInvoices.length}`);
        } else {
            const fuzzyClientCuit = findClientByFuzzy(t.descripcion || '', targetInvoices);
            if (fuzzyClientCuit) {
                targetInvoices = targetInvoices.filter(i => i.cuit_socio === fuzzyClientCuit);
                matchLevel = 3;
                console.log(`Applying Fuzzy filter (${fuzzyClientCuit}). Remaining invoices: ${targetInvoices.length}`);
            } else {
                console.log(`No CUIT or Fuzzy match. Comparing against ALL ${targetInvoices.length} invoices of this type.`);
            }
        }

        if (targetInvoices.length > 0) {
            const singleMatch = targetInvoices.find(i => Math.abs(Number(i.monto_pendiente) - transAmount) < 0.05);
            if (singleMatch) {
                console.log(`✅ EXACT MATCH FOUND! Invoice ${singleMatch.numero} for ${singleMatch.monto_pendiente}`);
                exactMatches++;
            } else {
                console.log(`❌ NO EXACT MATCH. Tx amount: ${transAmount}. Available invoice amounts: ${targetInvoices.map(i => Math.abs(Number(i.monto_pendiente))).join(', ')}`);
            }
        }
    }

    console.log(`\nTotal Exact Matches in subset: ${exactMatches}`);
}

debugMatching();
