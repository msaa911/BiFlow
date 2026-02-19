
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

const ORG_ID = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

async function reproduce() {
    console.log(`--- REPRODUCING ANALYSIS FOR ORG: ${ORG_ID} ---`);

    // 1. Fetch transactions
    const { data: transactions, error: tErr } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', ORG_ID);

    if (tErr) {
        console.error('Error fetching transitions:', tErr.message);
        return;
    }

    console.log(`Found ${transactions.length} transactions.`);

    const TAX_KEYWORDS = [
        'AFIP', 'ARBA', 'RETENCION', 'PERCEPCION', 'IIBB', 'SUSS', 'IMPUESTO',
        'IVA', 'GANANCIAS', 'BIENES PERSONALES', 'DREI', 'CANON',
        'AYSA', 'EDENOR', 'EDESUR', 'METROGAS', 'TELECOM', 'PERSONAL', 'CLARO', 'MOVISTAR', 'TELMEX'
    ];

    const newConfigs = [];
    const updates = [];

    for (const t of transactions) {
        const descUpper = t.descripcion.toUpperCase();
        const matched = TAX_KEYWORDS.find(k => descUpper.includes(k));

        if (matched) {
            console.log(`[MATCH] "${t.descripcion}" -> ${matched}`);
            newConfigs.push({
                organization_id: ORG_ID,
                patron_busqueda: t.descripcion,
                estado: 'PENDIENTE'
            });

            if (!t.tags || !t.tags.includes('pendiente_clasificacion')) {
                const newTags = [...(t.tags || []), 'pendiente_clasificacion'];
                updates.push({ id: t.id, tags: newTags });
            }
        }
    }

    console.log(`Found ${newConfigs.length} potential tax rules.`);

    if (newConfigs.length > 0) {
        console.log('Attempting upsert to configuracion_impuestos...');
        const { error: upErr } = await supabase.from('configuracion_impuestos').upsert(newConfigs, {
            onConflict: 'organization_id, patron_busqueda',
            ignoreDuplicates: true
        });
        if (upErr) console.error('UPSERT ERROR:', upErr.message);
        else console.log('UPSERT SUCCESS');
    }

    if (updates.length > 0) {
        console.log(`Attempting to update tags for ${updates.length} transactions...`);
        for (const u of updates) {
            const { error: tagErr } = await supabase.from('transacciones').update({ tags: u.tags }).eq('id', u.id);
            if (tagErr) console.error(`TAG ERROR for ${u.id}:`, tagErr.message);
        }
        console.log('TAG UPDATES FINISHED');
    }
}

reproduce();
