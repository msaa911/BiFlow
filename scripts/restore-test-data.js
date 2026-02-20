
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://bnlmoupgzbtgfgominzd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ"
);

const ORG_ID = "8bca8172-b23f-4da7-b50c-ba2fd78187ac";

async function restoreData() {
    console.log('[RESTORE] Cleanning first...');
    await supabase.from('transacciones').delete().eq('organization_id', ORG_ID);
    await supabase.from('tax_intelligence_rules').delete().eq('organization_id', ORG_ID);

    console.log('[RESTORE] Inserting test transactions...');
    const { data: trans, error: terr } = await supabase.from('transacciones').insert([
        {
            organization_id: ORG_ID,
            fecha: '2026-02-01',
            descripcion: 'DEBITO SERV. TELECOM / INTERNET',
            monto: -50000,
            origen_dato: 'test',
            moneda: 'ARS',
            estado: 'pendiente',
            tags: ['servicio_detectado'] // Pre-tagged as our engine would do
        },
        {
            organization_id: ORG_ID,
            fecha: '2026-01-01',
            descripcion: 'DEBITO SERV. TELECOM / INTERNET',
            monto: -48000,
            origen_dato: 'test',
            moneda: 'ARS',
            estado: 'pendiente',
            tags: ['servicio_detectado']
        }
    ]).select();

    if (terr) console.error('Error trans:', terr);

    console.log('[RESTORE] Inserting pending rule...');
    const { data: rules, error: rerr } = await supabase.from('tax_intelligence_rules').insert([
        {
            organization_id: ORG_ID,
            patron_busqueda: 'DEBITO SERV. TELECOM / INTERNET',
            categoria: 'servicio',
            estado: 'PENDIENTE'
        }
    ]).select();

    if (rerr) console.error('Error rules:', rerr);

    console.log('[RESTORE] DONE. Data is ready for classification testing.');
}

restoreData();
