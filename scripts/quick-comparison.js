async function getComparison() {
    try {
        console.log("Fetching PF rates...");
        const resPF = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');
        const dataPF = await resPF.json();

        const mainBanks = [
            "BANCO DE LA NACION ARGENTINA",
            "BANCO SANTANDER ARGENTINA S.A.",
            "BANCO DE GALICIA Y BUENOS AIRES S.A.",
            "BANCO DE LA PROVINCIA DE BUENOS AIRES",
            "BANCO BBVA ARGENTINA S.A."
        ];

        const pfStats = dataPF.filter(b => mainBanks.includes(b.entidad));

        console.log("Fetching BADLAR (trying v1/finanzas/indices/badlar again)...");
        // Experimenting with known endpoints
        let badlarValue = 0;
        let badlarDate = "";

        const resB = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/badlar');
        if (resB.ok) {
            const dataB = await resB.json();
            const lastB = dataB[dataB.length - 1];
            badlarValue = lastB.valor;
            badlarDate = lastB.fecha;
        } else {
            // Fallback to checking indices list if possible or other guess
            console.log("BADLAR endpoint failed, trying alternative...");
        }

        console.log("--- RESULTS ---");
        console.log("BADLAR:", badlarValue, "Date:", badlarDate);
        pfStats.forEach(b => {
            console.log(`${b.entidad}: ${b.tnaClientes}`);
        });

    } catch (e) {
        console.error("Comparison failed:", e.message);
    }
}
getComparison();
