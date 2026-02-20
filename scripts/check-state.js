
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

const ORG_ID = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

async function checkState() {
    console.log(`--- ESTADO PARA ORG: ${ORG_ID} ---`);

    // 1. Check New Tax Rules Table
    const { data: rules, error: rulesErr } = await supabase
        .from('reglas_fiscales_ia')
        .select('*')
        .eq('organization_id', ORG_ID);

    if (rulesErr) {
        console.error('Error en reglas_fiscales_ia:', rulesErr.message);
    } else {
        console.log(`Reglas encontradas en reglas_fiscales_ia: ${rules.length}`);
        if (rules.length > 0) console.log('Ejemplo:', rules[0]);
    }

    // 2. Check Transaction Tags
    const { data: trans, error: transErr } = await supabase
        .from('transacciones')
        .select('id, descripcion, tags')
        .eq('organization_id', ORG_ID)
        .limit(10);

    if (transErr) {
        console.error('Error en transacciones:', transErr.message);
    } else {
        const tagged = trans.filter(t => t.tags && t.tags.includes('pendiente_clasificacion'));
        console.log(`Transacciones revisadas: ${trans.length}`);
        console.log(`Transacciones con etiqueta 'pendiente': ${tagged.length}`);
        if (tagged.length > 0) console.log('Ejemplo etiquetada:', tagged[0]);
    }
}

checkState();
