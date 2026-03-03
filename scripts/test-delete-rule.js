const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

const ORG_ID = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

async function testDelete() {
    console.log('--- TEST DELETE tax_intelligence_rules ---');

    // 1. Fetch one rule
    const { data: rules, error: fetchErr } = await supabase
        .from('tax_intelligence_rules')
        .select('*')
        .eq('organization_id', ORG_ID)
        .limit(1);

    if (fetchErr) {
        console.error('Fetch error:', fetchErr.message);
        return;
    }

    if (!rules || rules.length === 0) {
        console.log('No rules found to delete.');
        return;
    }

    const ruleId = rules[0].id;
    console.log(`Attempting to delete rule: ${ruleId} (${rules[0].patron_busqueda})`);

    // 2. Attempt delete
    const { error: delErr } = await supabase
        .from('tax_intelligence_rules')
        .delete()
        .eq('id', ruleId);

    if (delErr) {
        console.error('Delete error:', delErr.message);
    } else {
        console.log('Delete call successful (Supabase returned no error)');

        // 3. Verify it's gone
        const { data: verify } = await supabase
            .from('tax_intelligence_rules')
            .select('*')
            .eq('id', ruleId);

        if (verify && verify.length > 0) {
            console.error('FAILURE: Rule still exists after successful delete call!');
        } else {
            console.log('SUCCESS: Rule is gone.');
        }
    }
}

testDelete();
