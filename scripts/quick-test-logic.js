
// Script para probar la lógica de reconciliación
const normalizeReference = (ref) => {
    if (!ref) return '';
    const upper = String(ref).toUpperCase().trim();
    // Remove common prefixes
    const stripped = upper.replace(/^(TRF|TRANSF|TRANSFERENCIA|CHQ|CHEQUE|DEP|DEPOSITO|RECIBO|RE|OP|PAGO|COBRO)[:\s-]*/i, '');
    const final = stripped.length >= 3 ? stripped : upper;
    return final.replace(/[^A-Z0-9]/gi, '').trim();
};

function testMatch(trans, m) {
    const rawInstrRef = (m.detalle_referencia || '').toUpperCase().trim();
    const descUpper = (trans.descripcion || '').toUpperCase();
    const trans_numero_cheque = (trans.numero_cheque || '').toUpperCase();

    console.log(`\nTesting: [Bank: "${descUpper}"] vs [System Ref: "${rawInstrRef}"]`);

    // --- REPRODUCCIÓN DE LA LÓGICA DEL MOTOR ---
    if (rawInstrRef && rawInstrRef.length >= 3) {
        // 1. Buscamos el número "nudo"
        const cleanRefNumber = rawInstrRef.replace(/\D/g, '').replace(/^0+/, '');
        if (cleanRefNumber && cleanRefNumber.length >= 3 && descUpper.includes(cleanRefNumber)) {
            console.log(`✅ MATCH: Clean numeric reference "${cleanRefNumber}" found in bank text`);
            return true;
        }

        // 2. Buscamos la referencia tal cual
        if (descUpper.includes(rawInstrRef)) {
            console.log(`✅ MATCH: Literal reference "${rawInstrRef}" found in bank text`);
            return true;
        }
    }

    const transDescClean = normalizeReference(trans.descripcion || '');
    const instrRefClean = normalizeReference(m.detalle_referencia || '');

    if (instrRefClean && instrRefClean.length >= 3 && transDescClean.includes(instrRefClean)) {
        console.log(`✅ MATCH: Normalized Reference "${instrRefClean}" found in description`);
        return true;
    }
    
    if (trans_numero_cheque && rawInstrRef && trans_numero_cheque.includes(rawInstrRef)) {
        console.log(`✅ MATCH: Check Number Match!`);
        return true;
    }

    console.log(`❌ NO MATCH FOUND`);
    return false;
}

const tests = [
    { bank: { descripcion: "TRANSF ALTA 123" }, sys: { detalle_referencia: "123" } },
    { bank: { descripcion: "PAGO PROV 45678/2023" }, sys: { detalle_referencia: "45678" } },
    { bank: { descripcion: "DEP. EFECTIVO 000099" }, sys: { detalle_referencia: "99" } }, // Fallaba antes por longitud < 3
    { bank: { descripcion: "TRF INTERESES 777" }, sys: { detalle_referencia: "TRF-777" } },
    { bank: { descripcion: "CHQ 888999" }, sys: { detalle_referencia: "888999" } }
];

tests.forEach(t => testMatch(t.bank, t.sys));
