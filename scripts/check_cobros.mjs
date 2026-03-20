import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCobros() {
  console.log('Searching for all "cobro" movements...');
  const { data, error } = await supabase
    .from('movimientos_tesoreria')
    .select('*, entidades(razon_social)')
    .eq('tipo', 'cobro')
    .order('fecha', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data.length} cobro movements:`);
  data.forEach(m => {
    console.log(`- ID: ${m.id}, Fecha: ${m.fecha}, Monto: ${m.monto_total}, Entidad: ${m.entidades?.razon_social}`);
  });
}

checkCobros();
