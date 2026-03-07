async function findBadlar() {
    const bases = [
        'https://api.argentinadatos.com/v1/finanzas/tasas/badlar',
        'https://api.argentinadatos.com/v1/finanzas/indices/badlar',
        'https://api.argentinadatos.com/v1/finanzas/indices/tasaBadlar',
        'https://api.argentinadatos.com/v1/finanzas/tasas/badlarBancos'
    ];

    for (const url of bases) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                console.log(`FOUND: ${url}`);
                console.log(`LATEST:`, data[data.length - 1]);
                return;
            } else {
                console.log(`FAIL: ${url} (${res.status})`);
            }
        } catch (e) { }
    }
    console.log("None of the guessed endpoints worked.");
}
findBadlar();
