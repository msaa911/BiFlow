
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function repairReferences() {
    console.log('--- Iniciando Reparación de Referencias ---')
    const { data: txs, error } = await supabase
        .from('transacciones')
        .select('id, descripcion, numero_cheque, metadata')
        .is('metadata->referencia', null)

    if (error) {
        console.error('Error:', error)
        return
    }

    console.log(`Encontradas ${txs?.length || 0} transacciones sin referencia.`)

    let updatedCount = 0;
    for (const tx of (txs || [])) {
        let reference = null;

        if (tx.numero_cheque) {
            reference = tx.numero_cheque;
        } else {
            const desc = tx.descripcion || '';
            // Patrones comunes
            const trfMatch = desc.match(/TRF-?\s*(\d+)/i);
            const loteMatch = desc.match(/LOTE\s*#?\s*(\d+)/i);
            const chMatch = desc.match(/CH\s*#?\s*(\d+)/i);
            const refMatch = desc.match(/REF\s*#?\s*(\d+)/i);

            if (trfMatch) reference = `TRF-${trfMatch[1]}`;
            else if (loteMatch) reference = `LOTE-${loteMatch[1]}`;
            else if (chMatch) reference = `CH-${chMatch[1]}`;
            else if (refMatch) reference = refMatch[1];
        }

        if (reference) {
            const newMetadata = { ...(tx.metadata || {}), referencia: reference };
            const { error: updateError } = await supabase
                .from('transacciones')
                .update({ metadata: newMetadata })
                .eq('id', tx.id);

            if (!updateError) updatedCount++;
        }
    }

    console.log(`Reparación completada. ${updatedCount} transacciones actualizadas.`)
}

repairReferences()
