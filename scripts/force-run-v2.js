
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

const ORG_ID = "8bca8172-b23f-4da7-b50c-ba2fd78187ac";

async function forceAnalysis() {
    console.log('[FORCE] Resetting and Analyzing...');

    // 1. Clear existing PENDIENTE rules to avoid conflicts and start fresh
    await supabase.from('tax_intelligence_rules').delete().eq('organization_id', ORG_ID);
    console.log('[FORCE] Old rules cleared.');

    // 2. Keywords
    const KEYWORD_GROUPS = [
        { category: 'impuesto', keywords: ['AFIP', 'ARBA', 'RETENCION', 'PERCEPCION', 'IIBB', 'SUSS', 'IMPUESTO', 'IVA', 'GANANCIAS', 'BIENES PERSONALES', 'DREI', 'CANON'] },
        { category: 'servicio', keywords: ['AYSA', 'EDENOR', 'EDESUR', 'METROGAS', 'TELECOM', 'PERSONAL', 'CLARO', 'MOVISTAR', 'TELMEX'] }
    ];
    const ALL_KEYWORDS = KEYWORD_GROUPS.flatMap(g => g.keywords.map(k => ({ word: k, category: g.category })));

    // 3. Fetch Transactions
    const { data: trans } = await supabase.from('transacciones').select('*').eq('organization_id', ORG_ID);
    console.log(`[FORCE] Found ${trans?.length || 0} transactions`);

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
            const tag = match.category === 'impuesto' ? 'pendiente_clasificacion' : 'servicio_detectado';
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

    // 4. Update Transactions
    console.log(`[FORCE] Updating ${updates.length} transactions...`);
    for (const u of updates) {
        await supabase.from('transacciones').update({ tags: u.tags }).eq('id', u.id);
    }

    // 5. Insert Rules (Using insert since we cleared before)
    console.log(`[FORCE] Inserting ${newRules.length} rules...`);
    if (newRules.length > 0) {
        const { error } = await supabase.from('tax_intelligence_rules').insert(newRules);
        if (error) {
            console.error('[FORCE] Error inserting rules:', error.message);
        } else {
            console.log('[FORCE] Rules inserted successfully.');
        }
    }

    console.log('[FORCE] DONE. Rules count:', newRules.length);
}

forceAnalysis();
