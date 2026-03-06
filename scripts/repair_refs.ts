import { createAdminClient } from '../lib/supabase/admin';

async function repairReferences() {
    const supabase = createAdminClient();
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

    console.log(`Starting reference repair for org: ${orgId}`);

    // Fetch all movements with empty instrument references
    const { data: movs, error } = await supabase
        .from('movimientos_tesoreria')
        .select('id, observaciones, numero, instrumentos_pago(*)')
        .eq('organization_id', orgId);

    if (error) {
        console.error('Error fetching movements:', error);
        return;
    }

    let repairedCount = 0;

    for (const mov of movs || []) {
        const instruments = (mov as any).instrumentos_pago || [];
        const emptyInstruments = instruments.filter((i: any) => !i.detalle_referencia);

        if (emptyInstruments.length === 0) continue;

        // Extract reference from observations or movement number
        let foundRef = null;

        const obs = mov.observaciones || '';
        const refMatch = obs.match(/\b\d{4,}\b/);
        if (refMatch) {
            foundRef = refMatch[0];
        } else if (mov.numero) {
            foundRef = mov.numero;
        }

        if (foundRef) {
            for (const inst of emptyInstruments) {
                console.log(`Repairing instrument ${inst.id} with ref ${foundRef}`);
                const { error: updateError } = await supabase
                    .from('instrumentos_pago')
                    .update({ detalle_referencia: foundRef })
                    .eq('id', inst.id);

                if (!updateError) repairedCount++;
            }
        }
    }

    console.log(`Repair completed. Repaired ${repairedCount} instruments.`);
}

repairReferences();
