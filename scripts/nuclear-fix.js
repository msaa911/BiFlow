
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

const ORG_ID = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

async function fixAndRun() {
    console.log(`--- NUCLEAR FIX AND ANALYSIS FOR ORG: ${ORG_ID} ---`);

    // 1. Force drop and recreate via direct RPC or similar? 
    // Wait, I don't have a direct SQL RPC. 
    // But I can try to rename the table if PostgREST allows it... no.

    // Since I can't run raw DDL via the standard client without an RPC, 
    // I will assume the migration I just pushed (and hopefully applied) will fix it.

    // But I want to check if it's FIXED now.
    const { error: checkErr } = await supabase.from('configuracion_impuestos').select('id').limit(1);

    if (checkErr && checkErr.message.includes('schema cache')) {
        console.log('CACHE STILL BROKEN. Trying a rename workaround?');
        // If I can't do DDL, I'm stuck until the server refreshes.
    } else {
        console.log('CACHE SEEMS OK (or table just empty)');
    }

    // 2. Perform the tagging anyway (since that worked)
    const { data: transactions } = await supabase.from('transacciones').select('*').eq('organization_id', ORG_ID);

    const TAX_KEYWORDS = [
        'AFIP', 'ARBA', 'RETENCION', 'PERCEPCION', 'IIBB', 'SUSS', 'IMPUESTO',
        'IVA', 'GANANCIAS', 'BIENES PERSONALES', 'DREI', 'CANON',
        'AYSA', 'EDENOR', 'EDESUR', 'METROGAS', 'TELECOM', 'PERSONAL', 'CLARO', 'MOVISTAR', 'TELMEX'
    ];

    const updates = [];
    const newRules = [];

    for (const t of transactions) {
        const descUpper = t.descripcion.toUpperCase();
        const matched = TAX_KEYWORDS.find(k => descUpper.includes(k));

        if (matched) {
            newRules.push({
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

    console.log(`Tagging ${updates.length} transactions...`);
    for (const u of updates) {
        await supabase.from('transacciones').update({ tags: u.tags }).eq('id', u.id);
    }

    console.log('Attempting to save rules...');
    const { error: upErr } = await supabase.from('configuracion_impuestos').upsert(newRules, {
        onConflict: 'organization_id, patron_busqueda',
        ignoreDuplicates: true
    });

    if (upErr) console.log('STILL FAILING RULE SAVE:', upErr.message);
    else console.log('RULE SAVE SUCCESS!');
}

fixAndRun();
