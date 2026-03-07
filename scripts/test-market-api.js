async function checkApi() {
    try {
        console.log("Checking Plazo Fijo rates...");
        const resTasas = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');
        const dataTasas = await resTasas.json();
        console.log("First 2 rates:", JSON.stringify(dataTasas.slice(0, 2), null, 2));

        const bancosConTasa = dataTasas.filter((b) => b.tnaClientes !== null && b.tnaClientes > 0);
        const tasaPromedio = bancosConTasa.length > 0 ? (bancosConTasa.reduce((acc, b) => acc + b.tnaClientes, 0) / bancosConTasa.length) : 0;
        console.log("Average Rate:", tasaPromedio);
        console.log("Count of banks with rate:", bancosConTasa.length);

        console.log("\nChecking available endpoints (guessing from pattern)...");
        // ArgentinaDatos doesn't seem to have a list of endpoints via API, but let's check common ones
        const endpoints = [
            'https://api.argentinadatos.com/v1/finanzas/indices/badlar',
            'https://api.argentinadatos.com/v1/finanzas/cotizaciones/dolar',
            'https://api.argentinadatos.com/v1/finanzas/indices/uva'
        ];

        for (const url of endpoints) {
            console.log(`Checking ${url}...`);
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                console.log(`Response length: ${Array.isArray(data) ? data.length : 'Object'}`);
                if (Array.isArray(data)) console.log("Last item:", data[data.length - 1]);
            } else {
                console.log(`Failed with status: ${res.status}`);
            }
        }

    } catch (err) {
        console.error("Error:", err);
    }
}

checkApi();
