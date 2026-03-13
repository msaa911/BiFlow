
const { UniversalTranslator } = require('../dist/lib/universal-translator'); // Suponiendo que está compilado o usando ts-node

// Mock de datos basados en lo que el usuario reportó
const sampleCSV = `Fecha;Concepto;Importe
01/03/2026;TRANSFERENCIA RECIBO TRF-MACRO-001;-1500.00
02/03/2026;LIQUIDACION TARJETAS REF. 157697;5000.00
03/03/2026;PAGO PROVEEDOR CHQ 882233;-2000.00
04/03/2026;TRANSF RECIBIDA DE JUAN 801933;3200.00
05/03/2026;VARIOS SIN REF;100.00
`;

console.log("=== PRUEBA DE TRADUCTOR UNIVERSAL (EXTRACCIÓN DE REFERENCIAS) ===");

// Simulamos la llamada que hace la API de upload
const result = UniversalTranslator.translate(sampleCSV);

console.log(`Transacciones procesadas: ${result.transactions.length}`);
console.log("---------------------------------------------------------");

result.transactions.forEach((t, i) => {
    console.log(`Fila ${i + 1}:`);
    console.log(`  Descripción: ${t.concepto}`);
    console.log(`  Monto: ${t.monto}`);
    console.log(`  Referencia Extraída: [${t.referencia || 'NULL'}]`);
    
    // Verificación de éxito
    if (i === 0 && t.referencia === 'MACRO-001') console.log("  ✅ Match TRF-MACRO-001");
    if (i === 1 && t.referencia === '157697') console.log("  ✅ Match REF. 157697");
    if (i === 2 && t.referencia === '882233') console.log("  ✅ Match CHQ 882233");
    if (i === 3 && t.referencia === '801933') console.log("  ✅ Match TRANSF ... 801933");
    if (i === 4 && !t.referencia) console.log("  ✅ Sin referencia (Correcto)");
    
    console.log("");
});
