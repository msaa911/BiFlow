
const fs = require('fs');

const extractoPath = 'd:\\proyecto-biflow\\test_data\\extracto_galicia_demo.csv';
const recibosPath = 'd:\\proyecto-biflow\\test_data\\recibos.csv';
const opsPath = 'd:\\proyecto-biflow\\test_data\\ordenes_pago.csv';

function parseCSVBetter(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    // Find the header line (contains 'Fecha' and 'Concepto' or 'Importe')
    const headerIdx = lines.findIndex(l => l.toLowerCase().includes('fecha') && (l.toLowerCase().includes('concepto') || l.toLowerCase().includes('importe')));

    if (headerIdx === -1) return [];

    const headers = lines[headerIdx].split(',').map(h => h.trim());
    return lines.slice(headerIdx + 1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = values[i] !== undefined ? values[i].trim() : '';
        });
        return obj;
    });
}

const extractoRaw = fs.readFileSync(extractoPath, 'utf8');
const bankTransactions = parseCSVBetter(extractoRaw);

const receiptsRaw = fs.readFileSync(recibosPath, 'utf8');
const receipts = parseCSVBetter(receiptsRaw);

const opsRaw = fs.readFileSync(opsPath, 'utf8');
const paymentOrders = parseCSVBetter(opsRaw);

const normalizeAmount = (val) => {
    if (!val || val === '') return 0;
    let clean = String(val).replace(/[^\d.,-]/g, '');
    if (clean.includes(',') && clean.includes('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
        clean = clean.replace(',', '.');
    }
    return Math.abs(parseFloat(clean) || 0);
};

let matches = [];
let unmatchedBank = [];

bankTransactions.forEach(tx => {
    const debito = normalizeAmount(tx.Debito || tx.debito);
    const credito = normalizeAmount(tx.Credito || tx.credito);
    const amount = credito > 0 ? credito : debito;
    if (amount === 0) return;

    let matchFound = false;
    if (credito > 0) {
        // Find receipt. Some receipts have multiple instruments in the CSV.
        // We match by amount.
        const match = receipts.find(r => Math.abs(normalizeAmount(r.Importe) - amount) < 1.0);
        if (match) {
            matches.push({ type: 'COBRO', bank: tx, treasury: match });
            matchFound = true;
        }
    } else {
        // Find OP
        const match = paymentOrders.find(op => Math.abs(normalizeAmount(op.Importe) - amount) < 1.0);
        if (match) {
            matches.push({ type: 'PAGO', bank: tx, treasury: match });
            matchFound = true;
        }
    }
    if (!matchFound) unmatchedBank.push(tx);
});

console.log('--- RECONCILIATION ANALYSIS RESULTS ---');
console.log(`Total Bank Transactions Analyzed: ${bankTransactions.length}`);
console.log(`Total Matches Identified: ${matches.length}`);

console.log('\n--- MATCHES DETAIL ---');
matches.forEach(m => {
    const amt = normalizeAmount(m.type === 'COBRO' ? m.bank.Credito : m.bank.Debito);
    const entity = m.type === 'COBRO' ? m.treasury.Cliente : m.treasury.Proveedor;
    console.log(`[${m.type}] ${m.bank.Fecha} | ${m.bank.Concepto} ($${amt}) matches ${m.type === 'COBRO' ? 'Recibo' : 'OP'} de ${entity}`);
});

const categorizable = unmatchedBank.filter(tx => {
    const c = (tx.Concepto || '').toLowerCase();
    return c.includes('mantenimiento') || c.includes('comision') || c.includes('gasto') || c.includes('interes') || c.includes('impuesto') || c.includes('afip') || c.includes('rechazo');
});

console.log(`\nCategorizable (Fees/Taxes/Alerts): ${categorizable.length}`);

console.log(`\nTruly Pending (No Treasury found): ${unmatchedBank.length - categorizable.length}`);
unmatchedBank.filter(tx => !categorizable.includes(tx)).forEach(tx => {
    console.log(` - ${tx.Fecha} | ${tx.Concepto} ($${normalizeAmount(tx.Credito || tx.Debito)})`);
});
