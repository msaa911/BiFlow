
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

const ORG_ID = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

async function finalVerify() {
    console.log(`--- FINAL VERIFICATION FOR ORG: ${ORG_ID} ---`);

    // 1. Fetch transactions
    const { data: transactions, error: tErr } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', ORG_ID);

    if (tErr) {
        console.error('Error fetching transactions:', tErr.message);
        return;
    }

    const TAX_KEYWORDS = [
        'AFIP', 'ARBA', 'RETENCION', 'PERCEPCION', 'IIBB', 'SUSS', 'IMPUESTO',
        'IVA', 'GANANCIAS', 'BIENES PERSONALES', 'DREI', 'CANON',
        'AYSA', 'EDENOR', 'EDESUR', 'METROGAS', 'TELECOM', 'PERSONAL', 'CLARO', 'MOVISTAR', 'TELMEX'
    ];

    const newRules = [];
    const updates = [];

    for (const t of transactions) {
        const descUpper = t.descripcion.toUpperCase();
        const matched = TAX_KEYWORDS.find(k => descUpper.includes(k));

        if (matched) {
            console.log(`[FOUND] ${t.descripcion}`);
            newRules.push({
                organization_id: ORG_ID,
                patron_busqueda: t.descripcion,
                estado: 'PENDIENTE'
            });

            const newTags = [...new Set([...(t.tags || []), 'pendiente_clasificacion'])];
            updates.push({ id: t.id, tags: newTags });
        }
    }

    console.log(`Tagging ${updates.length} transactions...`);
    for (const u of updates) {
        await supabase.from('transacciones').update({ tags: u.tags }).eq('id', u.id);
    }

    console.log(`Saving ${newRules.length} rules to reglas_fiscales_ia...`);
    const { data, error: upErr } = await supabase.from('reglas_fiscales_ia').upsert(newRules, {
        onConflict: 'organization_id, patron_busqueda',
        ignoreDuplicates: true
    }).select();

    if (upErr) {
        console.error('UPSERT ERROR:', upErr.message);
    } else {
        console.log('UPSERT SUCCESS! New table is WORKING.');
        console.log('Result:', data);
    }
}

finalVerify();
