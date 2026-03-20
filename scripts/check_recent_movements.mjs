import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecent() {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  console.log(`Searching for movements created after ${oneHourAgo}...`);
  
  const { data, error } = await supabase
    .from('movimientos_tesoreria')
    .select('*, entidades(razon_social)')
    .gt('created_at', oneHourAgo);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data.length} movements:`);
  data.forEach(m => {
    console.log(`- ID: ${m.id}, Fecha: ${m.fecha}, Monto: ${m.monto_total}, Tipo: ${m.tipo}, Entidad: ${m.entidades?.razon_social}`);
  });
}

checkRecent();
