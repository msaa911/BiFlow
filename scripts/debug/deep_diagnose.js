const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function deepDiagnose() {
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';
    let output = '--- DEEP DIAGNOSIS START (RELAXED RULES) ---\n';

    const { data: bankTxs, error: e1 } = await supabase.from('transacciones').select('*').eq('organization_id', orgId).eq('estado', 'pendiente');
    const { data: instruments, error: e2 } = await supabase.from('instrumentos_pago').select('*, movimientos_tesoreria(*, entidades(*), aplicaciones_pago(comprobantes(nro_factura)))').eq('organization_id', orgId).eq('estado', 'pendiente');

    output += `Analyzing ${bankTxs.length} bank txs and ${instruments.length} pending instruments.\n`;

    let simulatedMatches = 0;

    for (const tx of bankTxs) {
        const txAmt = Math.abs(tx.monto);
        const txDesc = (tx.descripcion || '').toUpperCase();
        const nearMatches = instruments.filter(inst => Math.abs(Math.abs(inst.monto) - txAmt) <= 2.0);

        if (nearMatches.length > 0) {
            output += `\n[BANK TX] Amt: ${tx.monto} | Desc: ${txDesc}\n`;
            for (const inst of nearMatches) {
                const mov = inst.movimientos_tesoreria;
                const ent = mov?.entidades;
                const ref = (inst.detalle_referencia || '').toUpperCase();
                const internalPrefixes = ['REC-', 'OP-', 'FAC-'];
                const isInternal = !ref || internalPrefixes.some(p => ref.startsWith(p));

                const hasRefMatch = ref && txDesc.includes(ref);
                const hasNroMatch = mov?.nro_comprobante && txDesc.includes(mov.nro_comprobante.toUpperCase());
                const isNearAmountMatch = isInternal;

                if (hasRefMatch || hasNroMatch || isNearAmountMatch) {
                    simulatedMatches++;
                    output += `   -> [MATCHED] Amt: ${inst.monto} | Ref: ${ref} | IsNearAmtOnly: ${isNearAmountMatch}\n`;
                } else {
                    output += `   -> [FAIL] Amt: ${inst.monto} | Ref: ${ref}\n`;
                }
            }
        }
    }

    output += `\nTotal Simulated Matches: ${simulatedMatches}\n`;
    fs.writeFileSync('diagnosis.log', output, 'utf8');
}

deepDiagnose();
