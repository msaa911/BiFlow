
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

async function nuclearReset() {
    console.log('--- NUCLEAR RESET START ---');

    // 1. Clear Findings
    console.log('Clearing hallazgos...');
    const { error: ferr } = await supabase.from('hallazgos').delete().eq('estado', 'detectado');
    if (ferr) console.error('Error clearing hallazgos:', ferr);

    // 2. Clear Tags from Transactions
    console.log('Clearing tags from transactions...');
    const { data: trans, error: terr } = await supabase.from('transacciones').select('id, tags');
    if (terr) console.error('Error fetching trans:', terr);

    if (trans) {
        for (const t of trans) {
            if (t.tags && (t.tags.includes('pendiente_clasificacion') || t.tags.includes('servicio_detectado') || t.tags.includes('impuesto_recuperable'))) {
                const newTags = t.tags.filter(tag => !['pendiente_clasificacion', 'servicio_detectado', 'impuesto_recuperable'].includes(tag));
                await supabase.from('transacciones').update({ tags: newTags }).eq('id', t.id);
            }
        }
    }

    // 3. Reset Tax Configuration to Pending
    console.log('Resetting tax rules...');
    const { error: rerr } = await supabase.from('reglas_fiscales_ia').delete().not('id', 'is', null);
    if (rerr) console.error('Error resetting rules:', rerr);

    console.log('--- NUCLEAR RESET COMPLETE ---');
    console.log('Now please click "Auditar" in the Dashboard.');
}

nuclearReset();
