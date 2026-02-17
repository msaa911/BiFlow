
import { UniversalTranslator } from './lib/universal-translator';

const rawText = `012025110400000007PAGO PROVEEDOR 000000126318309276273170000000000
012025110500000008PAGO PROVEEDOR 00000026714231221735170000000000`;

console.log("--- Testing Fixed Width Sticky Parsing ---");
const result = UniversalTranslator.translate(rawText);

result.transactions.forEach(t => {
    console.log(`Fecha: ${t.fecha} | Concepto: ${t.concepto} | Monto: ${t.monto} | CUIT: ${t.cuit}`);
});

if (result.transactions.length > 0 && result.transactions[0].monto === 1263.18 && result.transactions[0].cuit === '30927627317') {
    console.log("SUCCESS: Parsed correctly!");
} else {
    console.log("FAILURE: Parsing failed.");
}
