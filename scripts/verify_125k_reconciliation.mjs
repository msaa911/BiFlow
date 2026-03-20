import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkData() {
  console.log('Checking for $125,000 movements...');
  
  const { data: movements, error: movError } = await supabase
    .from('movimientos_tesoreria')
    .select('*, entidades(razon_social)')
    .eq('monto_total', 125000);

  if (movError) {
    console.error('Error fetching movements:', movError);
    return;
  }

  console.log(`Found ${movements.length} movements of $125,000:`);
  movements.forEach(m => {
    console.log(`- ID: ${m.id}, Fecha: ${m.fecha}, Entidad: ${m.entidades?.razon_social}, Tipo: ${m.tipo}`);
  });

  const { data: transactions, error: txError } = await supabase
    .from('transacciones')
    .select('*')
    .ilike('descripcion', '%TRF-MIXED-123%');

  if (txError) {
    console.error('Error fetching transactions:', txError);
    return;
  }

  console.log(`\nFound ${transactions.length} transactions with "TRF-MIXED-123":`);
  transactions.forEach(t => {
    console.log(`- ID: ${t.id}, Fecha: ${t.fecha}, Monto: ${t.monto}, Estado: ${t.estado}, Metadata:`, t.metadata);
  });
}

checkData();
