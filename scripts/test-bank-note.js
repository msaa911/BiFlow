const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testBankNoteCreation() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    console.log("--- TEST: BANK NOTE CREATION ---");

    // 1. Get a test organization and entity
    const { data: orgs } = await supabase.from('organizaciones').select('id').limit(1);
    if (!orgs || orgs.length === 0) {
        console.error("No organizations found");
        return;
    }
    const orgId = orgs[0].id;

    const { data: entities } = await supabase.from('entidades').select('id, cuit, razon_social').eq('organization_id', orgId).limit(1);
    if (!entities || entities.length === 0) {
        console.error("No entities found for org:", orgId);
        return;
    }
    const entity = entities[0];

    // 2. Simulate note creation (as in handleQuickCategorize)
    const testNoteNumber = `TEST-BN-${Date.now().toString().slice(-6)}`;
    const noteData = {
        organization_id: orgId,
        entidad_id: entity.id,
        tipo: 'ndb_bancaria',
        nro_factura: testNoteNumber,
        cuit_entidad: entity.cuit,
        razon_social_entidad: entity.razon_social,
        fecha_emision: new Date().toISOString().split('T')[0],
        fecha_vencimiento: new Date().toISOString().split('T')[0],
        monto_total: 100.50,
        monto_pendiente: 0,
        estado: 'conciliado',
        concepto: 'Gasto Bancario Test',
        metadata: { is_test: true }
    };

    console.log("Inserting test note:", testNoteNumber);
    const { data: inserted, error } = await supabase.from('comprobantes').insert(noteData).select().single();

    if (error) {
        console.error("Error creating note:", error);
    } else {
        console.log("Success! Note created with ID:", inserted.id);
        console.log("Fields verified:", {
            nro_factura: inserted.nro_factura,
            entidad_id: inserted.entidad_id,
            cuit_entidad: inserted.cuit_entidad,
            razon_social_entidad: inserted.razon_social_entidad
        });

        // 3. Cleanup
        await supabase.from('comprobantes').delete().eq('id', inserted.id);
        console.log("Test note deleted.");
    }
}

testBankNoteCreation();
