
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://bnlmoupgzbtgfgominzd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ";
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
    const txId = 'cee31b26-8b75-42cf-a388-2d285f02bbe6';
    const compId = 'fe32b7e2-82e8-4ed7-932b-b86e2e3e5982';

    console.log(`Attempting manual reconcile for Tx: ${txId} with Comp: ${compId}`);

    const { data, error } = await supabase
        .from('transacciones')
        .update({
            estado: 'conciliado',
            comprobante_id: compId,
            metadata: {
                reconciled_at: new Date().toISOString(),
                manual_fix_applied: true
            }
        })
        .eq('id', txId)
        .select();

    if (error) {
        console.error('Error during manual fix:', error);
    } else {
        console.log('Fix applied successfully:', data);
    }
}

fix();
