
const { UniversalTranslator } = require('./lib/universal-translator');
const fs = require('fs');

async function test() {
    console.log("--- Testing UniversalTranslator v6.0 (Treasury Edition) ---");
    const content = fs.readFileSync('./test_treasury.csv', 'utf8');
    const result = UniversalTranslator.translate(content);

    console.log(`Parsed ${result.transactions.length} transactions.`);
    result.transactions.forEach((t, i) => {
        console.log(`\nRow ${i + 1}:`);
        console.log(`  Entidad: ${t.razon_social}`);
        console.log(`  Banco: ${t.banco}`);
        console.log(`  Cheque: ${t.numero_cheque}`);
        console.log(`  Monto: ${t.monto}`);
        console.log(`  Vto: ${t.vencimiento}`);
    });

    // Verify Check detection logic
    const GaliciaCheck = result.transactions.find(t => t.banco === 'Galicia');
    if (GaliciaCheck && GaliciaCheck.numero_cheque === '12345678') {
        console.log("\n✅ SUCCESS: Check number correctly identified for Galicia.");
    } else {
        console.log("\n❌ FAIL: Check number mismatch.");
    }

    if (GaliciaCheck && Math.abs(GaliciaCheck.monto - 156436) < 1) {
        console.log("✅ SUCCESS: Argentinian dots-only currency parsed correctly.");
    } else {
        console.log(`❌ FAIL: Currency parse error. Expected 156436, got ${GaliciaCheck ? GaliciaCheck.monto : 'null'}`);
    }
}

test();
