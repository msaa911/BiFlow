const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

    console.log('Fetching pending instruments...');
    const { data: pendingInstr, error: err1 } = await supabase
        .from('instrumentos_pago')
        .select('*, movimientos_tesoreria(*, entidades(razon_social), aplicaciones_pago(comprobantes(nro_factura))))')
        .eq('organization_id', orgId)
        .eq('estado', 'pendiente');

    if (err1) {
        console.error('Error fetching instruments:', err1);
        return;
    }

    console.log('Fetching pending bank transactions...');
    const { data: pendingBank, error: err2 } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .eq('estado', 'pendiente');

    if (err2) {
        console.error('Error fetching transactions:', err2);
        return;
    }

    console.log(`Found ${pendingInstr.length} instruments and ${pendingBank.length} transactions.\n`);

    for (const tx of pendingBank) {
        const txAmt = Math.abs(tx.monto);
        const candidates = pendingInstr.filter(inst => Math.abs(Math.abs(inst.monto) - txAmt) <= 1.5);

        if (candidates.length > 0) {
            const desc = (tx.descripcion || '').toUpperCase();
            console.log(`\nBANK: [${tx.fecha}] Amt: ${txAmt} | Desc: ${desc}`);

            candidates.forEach(c => {
                const mov = c.movimientos_tesoreria;
                const apps = mov?.aplicaciones_pago || [];
                const invNums = apps.map(a => a.comprobantes?.nro_factura).filter(Boolean);

                console.log(`  -> INSTR: Entity: ${mov?.entidades?.razon_social} | Ref: ${c.detalle_referencia} | Invoices: ${invNums.join(', ') || 'NONE'}`);

                const hasInvMatch = invNums.some(num => {
                    const cleanNum = num.replace(/\D/g, '').replace(/^0+/, '');
                    return cleanNum.length >= 4 && desc.includes(cleanNum);
                });
                console.log(`     INV MATCH: ${hasInvMatch}`);

                const hasRefMatch = c.detalle_referencia && desc.includes(c.detalle_referencia.toUpperCase());
                console.log(`     REF MATCH: ${hasRefMatch}`);
            });
        }
    }
}

diagnose();
