import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const envConfig = envFile.split('\n').reduce((acc, line) => {
    const match = line.replace('\r', '').match(/^([^=]+)=(.*)$/)
    if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    return acc
}, {})

const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY)

async function checkDb() {
    console.log('--- DATABASE STATE DIAGNOSTIC ---');

    const { data: ins } = await supabase.from('instrumentos_pago').select('*');
    if (!ins || ins.length === 0) {
        console.log('[!] NO instruments found in the entire database.');
    } else {
        console.log(`Found ${ins.length} total instruments.`);
        const grouped = ins.reduce((acc, i) => {
            acc[i.estado] = (acc[i.estado] || 0) + 1;
            return acc;
        }, {});
        console.log('Instrument states:', grouped);

        console.log('\nSample instruments:');
        for (const i of ins.slice(0, 5)) {
            console.log(`- ID: ${i.id} | Ref: ${i.referencia} | Amt: $${i.monto} | State: ${i.estado}`);
        }
    }

    console.log('\n--------------------------\n');

    const { data: inv } = await supabase.from('comprobantes').select('*');
    if (!inv || inv.length === 0) {
        console.log('[!] NO invoices found in the database.');
    } else {
        console.log(`Found ${inv.length} total invoices.`);
        const grouped = inv.reduce((acc, i) => {
            acc[i.estado] = (acc[i.estado] || 0) + 1;
            return acc;
        }, {});
        console.log('Invoice states:', grouped);

        console.log('\nSample invoices:');
        for (const i of inv.slice(0, 5)) {
            console.log(`- ID: ${i.numero} | Pending Amt: $${i.monto_pendiente} | State: ${i.estado}`);
        }
    }

    console.log('\n--------------------------\n');

    const { data: tx } = await supabase.from('transacciones').select('*');
    if (!tx || tx.length === 0) {
        console.log('[!] NO bank transactions found in the database.');
    } else {
        console.log(`Found ${tx.length} total bank transactions.`);
        const grouped = tx.reduce((acc, t) => {
            acc[t.estado] = (acc[t.estado] || 0) + 1;
            return acc;
        }, {});
        console.log('Transaction states:', grouped);

        // Find the one that is reconciled
        const rec = tx.filter(t => t.estado === 'conciliado' || t.estado === 'parcial');
        if (rec.length > 0) {
            console.log('\nReconciled Transactions:');
            for (const r of rec) {
                console.log(`- ID: ${r.id} | Desc: ${r.descripcion} | Amt: $${r.monto} | State: ${r.estado}`);
                console.log(`  Metadata:`, r.metadata)
            }
        }
    }
}

checkDb();
