import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const getEnv = (key) => envContent.split('\n').find(l => l.startsWith(key))?.split('=')[1]?.trim();

const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'));
const ORG_ID = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

async function checkFinal() {
    console.log("Checking Galicia Cent Transactions...");
    
    const { data: txs, error } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', ORG_ID)
        .or('descripcion.ilike.%157697%,descripcion.ilike.%673947%');
        
    if (error) {
        console.error("Error:", error);
        return;
    }
    
    console.log("Found Transactions:");
    txs.forEach(t => {
        console.log(`- Desc: ${t.descripcion} | Monto: ${t.monto} | Estado: ${t.estado} | Mov ID: ${t.movimiento_id}`);
    });
    
    const matched = txs.filter(t => t.estado === 'conciliado');
    if (matched.length >= 2) {
        console.log("✅ VERIFIED: Both cent-mismatch transactions are CONCILIATED!");
    } else {
        console.log("❌ FAILED: Transactions still pending.");
    }
}

checkFinal();
