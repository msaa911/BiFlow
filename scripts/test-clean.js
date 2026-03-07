async function checkApi() {
    try {
        const res = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');
        const data = await res.json();
        const first = data[0];
        console.log("ENTITY:", first.entidad);
        console.log("TNA_CLIENTES:", first.tnaClientes);
        console.log("TNA_NO_CLIENTES:", first.tnaNoClientes);

        const bancosConTasa = data.filter((b) => b.tnaClientes !== null && b.tnaClientes > 0);
        const avg = bancosConTasa.reduce((acc, b) => acc + b.tnaClientes, 0) / bancosConTasa.length;
        console.log("CALCULATED_AVG:", avg);

        const resBadlar = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/badlar');
        if (resBadlar.ok) {
            const badlar = await resBadlar.json();
            console.log("BADLAR_LATEST:", badlar[badlar.length - 1]);
        }
    } catch (err) {
        console.error("FAIL:", err.message);
    }
}
checkApi();
