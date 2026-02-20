
function normalizeDate(str) {
    // If str is "2025-11-04" -> returns same
    // If "04/11/2025" -> "2025-11-04"
    if (str.includes('-')) return str;
    const p = str.split(/[/-]/);
    if (p.length !== 3) return null;
    let y = p[2].length === 2 ? `20${p[2]}` : p[2];
    return `${y}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
}

const lines = [
    "012025110400000007PAGO PROVEEDOR 000000126318309276273170000000000",
    "012025110500000008PAGO PROVEEDOR 00000026714231221735170000000000"
];

for (const line of lines) {
    const trimmed = line.trim();
    console.log(`\nLine: ${trimmed}`);
    let fecha = null;
    let monto = 0;

    // Pattern 1: DD/MM/YYYY
    const standardDate = trimmed.match(/(\d{2}[/-]\d{2}[/-]\d{2,4})/);
    if (standardDate) {
        console.log("Found Pattern 1:", standardDate[1]);
        fecha = normalizeDate(standardDate[1]);
    } else {
        // Pattern 2: Fixed Width YYYYMMDD
        // Original Regex: /(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/
        // Let's test precisely what was deployed.
        const compactDate = trimmed.match(/(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
        if (compactDate) {
            console.log("Found Pattern 2:", compactDate[0]);
            fecha = `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`;
        }
    }

    console.log("Fecha Detected:", fecha);

    if (fecha) {
        // Amount logic
        const numberBlocks = trimmed.split(/[^0-9,-]+/).filter(s => s.length > 0);
        const dateCleaned = fecha.replace(/-/g, '');
        // Filter out date block
        const candidates = numberBlocks.filter(b => !b.includes(dateCleaned));

        console.log("Candidates:", candidates);

        // Find amount candidate
        // Original logic: c.length >= 8 && c.length <= 18
        const amountCandidate = candidates.find(c => c.length >= 8 && c.length <= 18);
        console.log("Amount Candidate:", amountCandidate);

        if (amountCandidate) {
            monto = parseFloat(amountCandidate) / 100;
        }
    }
    console.log("Monto Final:", monto);
}
