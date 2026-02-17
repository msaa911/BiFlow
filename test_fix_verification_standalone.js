
// Mock UniversalTranslator with the NEW logic
class UniversalTranslator {
    static translate(rawText, options) {
        const lines = rawText.split('\n').filter(l => l.trim().length > 0);
        return { transactions: this.parseFixedWith(lines) };
    }

    static parseFixedWith(lines) {
        return lines.map(line => {
            const trimmed = line.replace(/(\r\n|\n|\r)/gm, "")
            if (trimmed.length < 20) return null

            let fecha = ''
            let concepto = ''
            let monto = 0
            let cuit = ''

            // Mock Date Match (Simplified for test)
            const dateMatch = trimmed.match(/(?:01)?(202\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/)
            if (dateMatch) {
                fecha = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
            }

            // --- THE NEW LOGIC TO VERIFY ---
            const amountMatch = trimmed.match(/(-?[\d\.,]+)$/)
            if (amountMatch) {
                const raw = amountMatch[1]
                if (!raw.includes('.') && !raw.includes(',') && raw.length > 15) {
                    const blocks = trimmed.split(/[^0-9]+/)
                    const amountBlock = blocks.find(b => b.length >= 10 && b.length <= 14 && !b.startsWith('202'))

                    if (amountBlock) {
                        monto = parseFloat(amountBlock) / 100
                    } else {
                        // Fallback: Check for VERY long blocks (Amount + CUIT concatenated)
                        // Example: 000000126318309276273170000000000
                        const longBlock = blocks.find(b => b.length > 18)
                        if (longBlock) {
                            // Try to find a CUIT inside: 20/23/24/27/30/33 + 9 digits
                            const cuitMatch = longBlock.match(/(20|23|24|27|30|33)[0-9]{9}/)
                            if (cuitMatch) {
                                const cuitFound = cuitMatch[0]
                                const cuitIndex = longBlock.indexOf(cuitFound)

                                // Assume everything BEFORE the CUIT is the Amount
                                // (ignoring leading zeros which parseFloat handles)
                                const amountPart = longBlock.substring(0, cuitIndex)

                                if (amountPart.length > 0) {
                                    monto = parseFloat(amountPart) / 100
                                    cuit = cuitFound // Extract valid CUIT
                                }
                            }
                        }
                    }
                } else {
                    monto = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
                }
            }
            // -----------------------------

            if (fecha && monto !== 0) {
                concepto = trimmed.substring(18, 50).replace(/[0-9]{10,}/g, '').trim()
            }

            return {
                fecha,
                concepto: concepto || 'Sin concepto',
                monto: Math.abs(monto),
                cuit: cuit || '',
                tipo: 'DEBITO',
                tags: []
            }
        }).filter((t) => t !== null)
    }
}

const rawText = `012025110400000007PAGO PROVEEDOR 000000126318309276273170000000000
012025110500000008PAGO PROVEEDOR 00000026714231221735170000000000`;

console.log("--- Testing Fixed Width Sticky Parsing (Standalone) ---");
const result = UniversalTranslator.translate(rawText);

result.transactions.forEach(t => {
    console.log(`Fecha: ${t.fecha} | Concepto: ${t.concepto} | Monto: ${t.monto} | CUIT: ${t.cuit}`);
});

if (result.transactions.length > 0) {
    const t = result.transactions[0];
    if (t.monto === 1263.18 && t.cuit === '30927627317') {
        console.log("SUCCESS: Parsed correctly!");
    } else {
        console.log(`FAILURE: Expected 1263.18/30927627317 but got ${t.monto}/${t.cuit}`);
    }
} else {
    console.log("FAILURE: No transactions found.");
}
