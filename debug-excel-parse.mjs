import * as XLSX from 'xlsx';

// Mocking the behavior of parseEntityExcel for debugging
function getVal(row, opts) {
    const k = opts.find(o => row[o] !== undefined);
    return k ? String(row[k]).trim() : '';
}

const sampleData = [
    { 'Razon Social': 'Test Supplier', 'Cuit': '30123456789', 'Provincia': 'MZA' },
    { 'Razón Social / Nombre': 'Another One', 'CUIT': '20112223330', 'Provincia': 'CABA' }
];

const ws = XLSX.utils.json_to_sheet(sampleData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, ws, 'Sheet1');
const buf = XLSX.write(workbook, { type: 'buffer' });

// Simulate parsing
const wb = XLSX.read(buf, { type: 'buffer' });
const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
console.log('Detected rows:', json.length);

json.forEach((row, i) => {
    const razonSocial = getVal(row, ['Razón Social / Nombre', 'Nombre', 'Razon Social', 'Empresa']);
    const rawCuit = getVal(row, ['CUIT', 'Cuit', 'cuit', 'CUIL']);
    console.log(`Row ${i + 1}: social="${razonSocial}" cuit="${rawCuit}"`);
});
