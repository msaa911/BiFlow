
// Prueba rápida de Regex V3 (Secuencial)
const strings = [
    "TRANSFERENCIA RECIBO TRF-MACRO-001",
    "LIQUIDACION TARJETAS REF. 157697",
    "PAGO PROVEEDOR CHQ 882233",
    "TRANSF RECIBIDA DE JUAN 801933",
    "VARIOS SIN REF"
];

const patterns = [
    /\bTRF[:\s-]*([A-Z0-9-]+)\b/i,
    /\bREF[:\s-]*(\d+)\b/i,
    /\bLIQ[:\s-]*(\d+)\b/i,
    /\b(?:TRANSF|TRANS)[:\s-]*(\d+)\b/i,
    /\b(\d{4,12})\b/ 
];

strings.forEach(s => {
    let match = null;
    for (const p of patterns) {
        const m = s.match(p);
        if (m && m[1]) {
            match = m[1];
            break;
        }
    }
    console.log(`Texto: "${s}" -> Match: ${match || 'NULL'}`);
});
