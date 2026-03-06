
const fs = require('fs');

const extractoPath = 'd:\\proyecto-biflow\\test_data\\extracto_galicia_demo.csv';
const recibosPath = 'd:\\proyecto-biflow\\test_data\\recibos.csv';
const opsPath = 'd:\\proyecto-biflow\\test_data\\ordenes_pago.csv';

function parseCSVBetter(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
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

console.log('--- ANALYSIS OF REFERENCE MATCHES WITH AMOUNT MISMATCHES ---');

let mismatches = [];

bankTransactions.forEach(tx => {
    const debito = normalizeAmount(tx.Debito || tx.debito);
    const credito = normalizeAmount(tx.Credito || tx.credito);
    const bankAmount = credito > 0 ? credito : debito;
    const isCredit = credito > 0;
    const bankConcept = (tx.Concepto || '').toUpperCase();

    // Look for potential matches by Reference (TRF-XXXX or Nro de Cheque)
    const matchingTreasury = isCredit ? receipts : paymentOrders;

    matchingTreasury.forEach(tr => {
        const trRef = (tr.Detalle || '').toUpperCase();
        const trAmount = normalizeAmount(tr.Importe);

        // Rule: If Reference is present and matches, check amount
        if (trRef && trRef.length > 3 && bankConcept.includes(trRef)) {
            const diff = Math.abs(bankAmount - trAmount);
            if (diff > 2.0) { // Significant mismatch
                mismatches.push({
                    bank: tx,
                    treasury: tr,
                    bankAmount,
                    trAmount,
                    diff,
                    ref: trRef
                });
            }
        }
    });
});

if (mismatches.length === 0) {
    console.log('No Reference matches with Amount Mismatches were found in the current test data.');
} else {
    console.log(`Found ${mismatches.length} Inconsistencies:`);
    mismatches.forEach(m => {
        console.log(`\nMismatch Detected (Ref: ${m.ref}):`);
        console.log(` - Bank: ${m.bank.Fecha} | ${m.bank.Concepto} | Amount: $${m.bankAmount}`);
        console.log(` - Treasury: ${m.treasury.Fecha} | ${m.treasury.Cliente || m.treasury.Proveedor} | Amount: $${m.trAmount}`);
        console.log(` - Difference: $${m.diff.toFixed(2)}`);
    });
}
