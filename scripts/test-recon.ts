import { createClient } from '@supabase/supabase-js'
import { ReconciliationEngine } from '../lib/reconciliation-engine'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseServiceKey) // Using service key for admin overrides in test

async function testEngine() {
    console.log("Iniciando test directo del motor de conciliación...");

    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
    if (!orgs || orgs.length === 0) {
        console.error("No hay organizaciones.");
        return;
    }
    const orgId = orgs[0].id;
    console.log(`Usando Org ID: ${orgId}`);

    try {
        console.log("Llamando a ReconciliationEngine.matchAndReconcile en modo dryRun...");
        const result = await ReconciliationEngine.matchAndReconcile(supabase, orgId, { dryRun: true });

        console.log(`\n\n--- RESULTADO OBTENIDO ---`);
        console.log(`Matched (comprobantes/movimientos con match exacto): ${result.matched}`);
        console.log(`Repaired (huérfanos corregidos): ${result.repaired}`);
        console.log(`Acciones sugeridas/ejecutadas: ${result.actions?.length}`);

        if (result.actions && result.actions.length > 0) {
            console.log("Muestra de las top 5 acciones:");
            console.log(JSON.stringify(result.actions.slice(0, 5), null, 2));
        }

    } catch (error) {
        console.error("Error durante la ejecución del motor:", error);
    }
}

testEngine()
