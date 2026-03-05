import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY)

function normalizeReference(ref) {
    if (!ref) return '';
    return ref.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

async function diagnose() {
    console.log('--- STARTING DIAGNOSTIC RUN ---');

    // 1. Get pending trans
    const { data: trans, error: txErr } = await supabase
        .from('transacciones')
        .select('*')
        .in('estado', ['pendiente', 'parcial'])
        .order('fecha', { ascending: true });

    // 2. Get pending instruments
    const { data: instruments, error: inErr } = await supabase
        .from('instrumentos_pago')
        .select('*, movimientos_tesoreria(*)')
        .eq('estado', 'pendiente');

    // 3. Get pending invoices
    const { data: invoices } = await supabase
        .from('comprobantes')
        .select('*')
        .or('monto_pendiente.is.null,monto_pendiente.gt.0')
        .order('fecha_emision', { ascending: true });

    console.log(`Found ${trans?.length || 0} pending transactions`);
    console.log(`Found ${instruments?.length || 0} pending instruments`);
    console.log(`Found ${invoices?.length || 0} pending invoices`);

    if (!trans?.length || (!instruments?.length && !invoices?.length)) return;

    let simulatedMatches = 0;

    for (const t of trans) {
        const tAmount = Math.abs(Number(t.monto) - Number(t.monto_usado || 0));
        const tDesc = (t.descripcion || '').toUpperCase();
        console.log(`\nTesting Tx: ${t.descripcion} | ID: ${t.id} | Amt: $${tAmount}`);

        let foundMatch = false;

        for (const i of (instruments || [])) {
            const iAmount = Math.abs(Number(i.monto));
            const iRefRaw = (i.referencia || '').trim();
            const iRefClean = normalizeReference(iRefRaw);
            const refNumsOnly = iRefRaw.replace(/\D/g, '');

            // Amount match test
            const exactAmountStr = iAmount.toFixed(2) === tAmount.toFixed(2);
            const floorAmountStr = Math.floor(iAmount) === Math.floor(tAmount);
            const tolerAmountStr = Math.abs(iAmount - tAmount) <= 1.5;

            const amountMatches = floorAmountStr || tolerAmountStr;

            if (!amountMatches) continue; // Skip reporting wrong amounts

            console.log(`  -> Potential amount match with Inst ${i.id} (Ref: ${iRefRaw}, Amt: $${iAmount})`);
            console.log(`     Exact: ${exactAmountStr}, Floor: ${floorAmountStr}, Tol: ${tolerAmountStr}`);

            // Reference match test
            const literalMatch = iRefRaw.length >= 3 && tDesc.includes(iRefRaw.toUpperCase());
            const cleanMatch = iRefClean.length >= 3 && normalizeReference(tDesc).includes(iRefClean);
            const numMatch = refNumsOnly.length >= 4 && tDesc.includes(refNumsOnly);

            if (literalMatch || cleanMatch || numMatch) {
                console.log(`     *** MATCH SUCCESS *** (Literal: ${literalMatch}, Clean: ${cleanMatch}, Num: ${numMatch})`);
                simulatedMatches++;
                foundMatch = true;
                break;
            } else {
                console.log(`     --- REF FAILED --- tDesc: ${tDesc} | RefRaw: ${iRefRaw} | RefClean: ${iRefClean} | RefNum: ${refNumsOnly}`);
            }
        }

        // If no instrument found, try invoices
        if (!foundMatch) {
            console.log(`  [!] No instrument matched. Trying invoices...`);
            for (const inv of (invoices || [])) {
                const pendingAmount = Math.abs(Number(inv.monto_pendiente !== null ? inv.monto_pendiente : (inv.monto_total || 0)));
                const invNro = (inv.numero || '').toUpperCase();

                const exactAmountStr = pendingAmount.toFixed(2) === tAmount.toFixed(2);
                const floorAmountStr = Math.floor(pendingAmount) === Math.floor(tAmount);
                const tolerAmountStr = Math.abs(pendingAmount - tAmount) <= 1.5;

                const amountMatches = floorAmountStr || tolerAmountStr;

                if (!amountMatches) continue;

                console.log(`  -> Potential amount invoice match with Inv ${inv.id} (Nro: ${invNro}, Pending: $${pendingAmount})`);

                const cleanFact = normalizeReference(invNro);
                const lastDigits = invNro.split('-').pop()?.replace(/^0+/, '');

                const literalMatch = tDesc.includes(invNro);
                const cleanMatch = cleanFact && cleanFact.length >= 4 && tDesc.includes(cleanFact);
                const numMatch = lastDigits && lastDigits.length >= 4 && tDesc.includes(lastDigits);

                if (literalMatch || cleanMatch || numMatch) {
                    console.log(`     *** INVOICE MATCH SUCCESS ***`);
                    simulatedMatches++;
                    foundMatch = true;
                    break;
                } else {
                    console.log(`     --- INV REF FAILED --- tDesc: ${tDesc} | Nro: ${invNro} | Clean: ${cleanFact} | Last: ${lastDigits}`);
                }
            }
        }

        if (!foundMatch) {
            console.log(`  [!] No instrument or invoice matched this transaction.`);
        }
    }

    console.log(`\n--- DIAGNOSTIC COMPLETE: Found ${simulatedMatches} possible matches ---`);
}

diagnose();
