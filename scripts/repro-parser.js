
const { UniversalTranslator } = require('../lib/universal-translator');

const testData = `
30/08/2026|30-11122299-9|SUSCRIPCION SOFTWARE|120.00|DEBITO
30/08/2026|30-22211100-0|TRANSFERENCIA SALIENTE|50000.00|DEBITO
28/08/2026|30-66677788-8|COMISION MANT.|12000.00|DEBITO
`;

console.log('--- TESTING UNIVERSAL TRANSLATOR ---');
const result = UniversalTranslator.translate(testData);

console.log('Detected Delimiter:', UniversalTranslator.detectDelimiter(testData));
console.log('Result Count:', result.transactions.length);
result.transactions.forEach((t, i) => {
    console.log(`${i + 1}. Date: ${t.fecha} | Amt: ${t.monto} | Desc: ${t.concepto}`);
});

if (result.transactions.length === 0) {
    console.log('Fell back (if this were route.ts)');
}
