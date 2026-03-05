
import { createAdminClient } from '../lib/supabase/admin'

async function debugData() {
    const supabase = createAdminClient();

    const { data: orgs } = await supabase.from('organizations').select('id, name').limit(1);

    if (!orgs || orgs.length === 0) {
        console.error("No organizations found");
        return;
    }

    const orgId = orgs[0].id;
    console.log(`--- DEBUGGING ORG: ${orgs[0].name} (${orgId}) ---`);

    // 1. Check for Pending Invoices and Movements to see if Phase 1 should work
    const { data: invoices } = await supabase
        .from('comprobantes')
        .select('id, nro_factura, tipo, monto, monto_pendiente, estado')
        .eq('organization_id', orgId)
        .or('monto_pendiente.is.null,monto_pendiente.gt.0');

    const { data: movements } = await supabase
        .from('movimientos_tesoreria')
        .select('id, concepto, importe, tipo, aplicaciones_pago(id)')
        .eq('organization_id', orgId);

    console.log(`\nFound ${invoices?.length || 0} pending invoices.`);
    console.log(`Found ${movements?.length || 0} total movements.`);

    const unlinkedMovements = movements?.filter(m => !m.aplicaciones_pago || m.aplicaciones_pago.length === 0) || [];
    console.log(`Found ${unlinkedMovements.length} unlinked movements.`);

    if (unlinkedMovements.length > 0) {
        console.log("\n--- UNLINKED MOVEMENTS ---");
        unlinkedMovements.slice(0, 5).forEach(m => {
            console.log(`ID: ${m.id}, Concepto: "${m.concepto}", Importe: ${m.importe}, Tipo: ${m.tipo}`);
        });
    }

    // 2. Check for Bank matching potential (Phase 2)
    const { data: bankTrans } = await supabase
        .from('transacciones')
        .select('id, descripcion, monto, estado')
        .eq('organization_id', orgId)
        .in('estado', ['pendiente', 'parcial']);

    const { data: instruments } = await supabase
        .from('instrumentos_pago')
        .select('*, movimientos_tesoreria(id, tipo, concepto)')
        .eq('organization_id', orgId)
        .in('estado', ['pendiente', 'parcial']);

    console.log(`\nFound ${bankTrans?.length || 0} pending bank transactions.`);
    console.log(`Found ${instruments?.length || 0} pending payment instruments.`);

    if (bankTrans && bankTrans.length > 0) {
        console.log("\n--- PENDING BANK TRANSACTIONS (Sample) ---");
        bankTrans.slice(0, 5).forEach(t => {
            console.log(`ID: ${t.id}, Desc: "${t.descripcion}", Monto: ${t.monto}`);
        });
    }

    if (instruments && instruments.length > 0) {
        console.log("\n--- PENDING INSTRUMENTS (Sample) ---");
        instruments.slice(0, 5).forEach(i => {
            console.log(`ID: ${i.id}, Ref: "${i.detalle_referencia}", Monto: ${i.monto}, MovID: ${i.movimientos_tesoreria?.id}`);
        });
    }
}

debugData().catch(console.error);
