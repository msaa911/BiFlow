import { createAdminClient } from './lib/supabase/admin';

async function repairReferences() {
    const supabase = createAdminClient();
    const orgId = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

    console.log(`Starting reference repair for org: ${orgId}`);

    // Fetch all movements with their instruments
    const { data: movs, error } = await supabase
        .from('movimientos_tesoreria')
        .select(`
            id, 
            observaciones, 
            numero, 
            instrumentos_pago!inner (*)
        `)
        .eq('organization_id', orgId);

    if (error) {
        console.error('Error fetching movements:', error);
        return;
    }

    console.log(`Analyzing ${movs.length} movements with instruments.`);
    let repairedCount = 0;

    for (const mov of movs) {
        const instruments = mov.instrumentos_pago || [];
        const emptyInstruments = instruments.filter(i => !i.referencia || i.referencia === 'undefined');

        if (emptyInstruments.length === 0) continue;

        let foundRef = null;

        // 1. Try to find a number (ref) in observations
        const obs = mov.observaciones || '';
        // Look for typical transfer/check patterns or numbers > 4 digits
        const refMatch = obs.match(/\b\d{4,}\b/);

        if (refMatch) {
            foundRef = refMatch[0];
        } else if (mov.numero && mov.numero.includes('-')) {
            // If number has a dash (REC-XXX), use it as fallback
            foundRef = mov.numero;
        }

        if (foundRef) {
            for (const inst of emptyInstruments) {
                console.log(`Updating instrument ${inst.id} -> Ref: ${foundRef}`);
                const { error: updateError } = await supabase
                    .from('instrumentos_pago')
                    .update({ referencia: foundRef })
                    .eq('id', inst.id);

                if (updateError) {
                    console.error(`Failed to update ${inst.id}:`, updateError);
                } else {
                    repairedCount++;
                }
            }
        }
    }

    console.log(`Repair completed. Total instruments updated: ${repairedCount}`);
}

repairReferences();
