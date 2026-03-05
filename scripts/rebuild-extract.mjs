import fs from 'fs';

const extractoData = fs.readFileSync('test_data/extracto_galicia_demo.csv', 'utf-8');
const recibosData = fs.readFileSync('test_data/recibos.csv', 'utf-8');
const ordenesData = fs.readFileSync('test_data/ordenes_pago.csv', 'utf-8');

const parseCsv = (csv) => {
    const lines = csv.split('\n').filter(l => l.trim());
    return lines.slice(1).map(l => l.split(','));
};

const recibos = parseCsv(recibosData);
const ordenes = parseCsv(ordenesData);

let extractoLines = extractoData.split('\n');

// Skip until header "Fecha,Concepto,Debito,Credito,Saldo"
let headerIndex = -1;
for (let i = 0; i < extractoLines.length; i++) {
    if (extractoLines[i].startsWith('Fecha,Concepto,Debito,Credito,Saldo')) {
        headerIndex = i;
        break;
    }
}

if (headerIndex !== -1) {
    let rowIndex = headerIndex + 1;
    let balance = 14796768.00;

    // First 5 matches will be Receipts (CREDIT)
    for (let i = 0; i < 5 && i < recibos.length; i++) {
        const [fecha, rec, cliente, cuit, comp, ref, importe] = recibos[i];

        let modRef = ref;
        let modImporte = Number(importe);

        // Let's create intentional variations to test relaxed matching
        if (i === 0) modImporte = modImporte + 0.99; // Decimal variation
        if (i === 1) modRef = ref.replace(/[^0-9]/g, ''); // Numbers only in extract
        if (i === 2) modRef = "Ref-" + ref; // Extra string

        balance += Number(importe); // Keep pseudo balance
        extractoLines[rowIndex] = `${fecha},Liquidacion ${modRef},,${modImporte.toFixed(2)},${balance.toFixed(2)}`;
        rowIndex++;
    }

    // Next 5 matches will be Payment Orders (DEBIT)
    for (let i = 0; i < 5 && i < ordenes.length; i++) {
        const [fecha, ord, prov, cuit, comp, ref, importe] = ordenes[i];

        let modRef = ref;
        let modImporte = Number(importe);

        // Variations
        if (i === 0) modImporte = modImporte - 0.50; // Decimal shrink
        if (i === 1) modRef = "Trans " + ref.replace(/[^0-9]/g, ''); // Extract just numbers

        balance -= Number(importe);
        extractoLines[rowIndex] = `${fecha},Pago Proveedor ${modRef},${modImporte.toFixed(2)},,${balance.toFixed(2)}`;
        rowIndex++;
    }
}

fs.writeFileSync('test_data/extracto_galicia_demo.csv', extractoLines.join('\n'));
console.log('Successfully updated extracto_galicia_demo.csv with synthetic matches from recibos/ordenes.');
