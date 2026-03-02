import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

function getEnvProps() {
    const envFile = fs.readFileSync('.env.local', 'utf8')
    const env = {}
    envFile.split('\n').forEach(line => {
        const parts = line.split('=')
        if (parts.length > 1) {
            env[parts[0]] = parts.slice(1).join('=').trim().replace(/['"]/g, '')
        }
    })
    return env
}

function findSubsetSum(invoices, targetSum, maxDepth = 6) {
    targetSum = Math.round(targetSum * 100) / 100;

    let bestMatch = null;
    let minDiff = Infinity;

    function backtrack(startIndex, currentSubset, currentSum) {
        currentSum = Math.round(currentSum * 100) / 100;

        if (currentSubset.length > 0) {
            const diff = targetSum - currentSum;
            if (Math.abs(diff) < 0.05) {
                bestMatch = [...currentSubset];
                minDiff = Math.abs(diff);
                return;
            }
        }

        if (currentSubset.length >= maxDepth) return;
        if (bestMatch && minDiff < 0.05) return; // found exact

        for (let i = startIndex; i < invoices.length; i++) {
            const inv = invoices[i];
            const invAmount = Math.round(Number(inv.monto_pendiente) * 100) / 100;

            // Pruning: The logic `currentSum + invAmount > targetSum + 0.05` assumes we never want a combination that exceeds target, 
            // but we absolutely want to support "Partial Bank Payment against 1 or more invoices" right? 
            // Wait, standard 1-a-N requires exact subset sum. So the pruning is correct for exact subsets.
            if (currentSum + invAmount > targetSum + 0.05) continue;

            currentSubset.push(inv);
            backtrack(i + 1, currentSubset, currentSum + invAmount);
            currentSubset.pop();
        }
    }

    const sortedInvoices = [...invoices].sort((a, b) => Number(b.monto_pendiente) - Number(a.monto_pendiente));
    backtrack(0, [], 0);

    return (bestMatch && minDiff < 0.05) ? bestMatch : null;
}

function findMatchByProximity(trans, invoices) {
    const transDate = new Date(trans.fecha);
    const transAmount = Math.abs(Number(trans.monto)) - Number(trans.monto_usado || 0);

    console.log(`\n  [Proximity Check] transAmount: ${transAmount}, date: ${transDate.toISOString()}`)
    return invoices.find(inv => {
        const invDate = new Date(inv.fecha_vencimiento || inv.fecha_emision);
        const diffDays = Math.abs(invDate.getTime() - transDate.getTime()) / (1000 * 3600 * 24);

        const isMatch = diffDays <= 3 && Math.abs(Number(inv.monto_pendiente) - transAmount) < 0.05;
        console.log(`   - Inv: ${inv.numero} | DiffDays: ${diffDays.toFixed(1)} | Amount: ${inv.monto_pendiente} | isMatch: ${isMatch}`)
        return isMatch;
    });
}


async function run() {
    console.log("--- Starting Auto-Reconcile Simulation ---")
    const env = getEnvProps()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase variables')
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: testInv } = await supabase.from('comprobantes').select('organization_id').limit(1).single()
    const orgId = testInv?.organization_id

    const { data: pendingInvoices } = await supabase.from('comprobantes').select('*').eq('organization_id', orgId).in('estado', ['pendiente', 'parcial'])
    const { data: pendingTrans } = await supabase.from('transacciones').select('*').eq('organization_id', orgId).in('estado', ['pendiente', 'parcial'])


    const normalizeCuit = (cuit) => cuit ? cuit.replace(/\D/g, '') : '';

    for (const trans of pendingTrans) {
        const totalBankAmount = Math.abs(Number(trans.monto));
        const previouslyUsed = Number(trans.monto_usado || 0);
        const availableTransAmount = totalBankAmount - previouslyUsed;

        if (availableTransAmount <= 0.05) continue;
        if (!trans.descripcion?.toLowerCase().includes('test') && !trans.referencia?.toLowerCase().includes('test')) continue;

        console.log(`\n\n-----------------`)
        console.log(`EVALUATING: ${trans.descripcion || trans.referencia} | M: ${availableTransAmount}`)

        const isCobro = trans.monto > 0;
        const targetTipos = isCobro ? ['factura_venta', 'nota_debito', 'ingreso_vario'] : ['factura_compra', 'nota_credito', 'egreso_vario'];
        let targetInvoices = pendingInvoices.filter(i => targetTipos.includes(i.tipo));

        let matchLevel = 0;
        const txCuitNormalized = normalizeCuit(trans.cuit);

        if (txCuitNormalized) {
            targetInvoices = targetInvoices.filter(i => normalizeCuit(i.cuit_socio) === txCuitNormalized);
            matchLevel = 1;
        }

        console.log(`Match Level Reached: ${matchLevel}. Filtered target invoices:`)
        targetInvoices.forEach(i => console.log(`   * ${i.numero} | Pend: ${i.monto_pendiente}`))

        let finalMatch = null;
        if (targetInvoices.length > 0) {
            const singleMatch = targetInvoices.find(i => Math.abs(Number(i.monto_pendiente) - availableTransAmount) < 0.05);
            if (singleMatch) {
                console.log(` -> EXACT 1-TO-1 FOUND: ${singleMatch.numero}`);
                finalMatch = [singleMatch];
            } else if (targetInvoices.length <= 15) {
                console.log(` -> TRYING SUBSET FOR TARGET ${availableTransAmount}...`);
                finalMatch = findSubsetSum(targetInvoices, availableTransAmount);
                if (finalMatch) console.log(` -> SUBSET FOUND: ${finalMatch.map(f => f.numero).join(',')}`)
            }
        }

        if (finalMatch && matchLevel <= 4) {
            console.log(`=== CIRCUIT WILL EXECUTE FOR ${finalMatch.length} INVOICES ===`);
        } else {
            console.log(`=== NO AUTO MATCH. CHECKING SUGGESTIONS ===`);
            const timeMatch = findMatchByProximity(trans, targetInvoices);
            if (timeMatch) console.log(`SUGGESTION 2: Use PROXIMITY Match: ${timeMatch.numero}`);
        }
    }
}

run().catch(console.error)
