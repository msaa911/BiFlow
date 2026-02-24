
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

const ORG_ID = "8bca8172-b23f-4da7-b50c-ba2fd78187ac";

async function forceAnalysis() {
    console.log('[FORCE] Starting deep analysis for:', ORG_ID);

    // 1. Keywords
    const KEYWORD_GROUPS = [
        { category: 'impuesto', keywords: ['AFIP', 'ARBA', 'RETENCION', 'PERCEPCION', 'IIBB', 'SUSS', 'IMPUESTO', 'IVA', 'GANANCIAS', 'BIENES PERSONALES', 'DREI', 'CANON'] },
        { category: 'servicio', keywords: ['AYSA', 'EDENOR', 'EDESUR', 'METROGAS', 'TELECOM', 'PERSONAL', 'CLARO', 'MOVISTAR', 'TELMEX'] }
    ];
    const ALL_KEYWORDS = KEYWORD_GROUPS.flatMap(g => g.keywords.map(k => ({ word: k, category: g.category })));

    // 2. Fetch Transactions
    const { data: trans } = await supabase.from('transacciones').select('*').eq('organization_id', ORG_ID);
    console.log(`[FORCE] Found ${trans.length} transactions`);

    const updates = [];
    const newRules = [];
    const seenNewPatrons = new Set();

    for (const t of trans) {
        const descUpper = t.descripcion.toUpperCase();

        const match = ALL_KEYWORDS.find(k => {
            if (k.word.length <= 8) {
                const regex = new RegExp(`\\b${k.word}\\b`, 'i');
                return regex.test(descUpper);
            }
            return descUpper.includes(k.word);
        });

        if (match) {
            console.log(`[FORCE] MATCH: ${t.descripcion} -> ${match.category}`);
            const tag = match.category === 'impuesto' ? 'pendiente_clasificacion' : 'servicio_detectado';

            // Cleanup old tags and add new one
            let existingTags = (t.tags || []).filter(tg => tg !== 'pendiente_clasificacion' && tg !== 'servicio_detectado');
            if (!existingTags.includes(tag)) {
                existingTags.push(tag);
                updates.push({ id: t.id, tags: existingTags });
            }

            if (!seenNewPatrons.has(descUpper)) {
                newRules.push({
                    organization_id: ORG_ID,
                    patron_busqueda: t.descripcion,
                    categoria: match.category,
                    estado: 'PENDIENTE'
                });
                seenNewPatrons.add(descUpper);
            }
        }
    }

    // 3. Execution
    console.log(`[FORCE] Applying ${updates.length} tag updates...`);
    for (const u of updates) {
        await supabase.from('transacciones').update({ tags: u.tags }).eq('id', u.id);
    }

    console.log(`[FORCE] Creating ${newRules.length} learning rules...`);
    if (newRules.length > 0) {
        await supabase.from('reglas_fiscales_ia').upsert(newRules, { onConflict: 'organization_id, patron_busqueda' });
    }

    console.log('[FORCE] DONE. Please refresh dashboard.');
}

forceAnalysis();
