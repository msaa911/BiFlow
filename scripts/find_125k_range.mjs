import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findMovement() {
  console.log('Searching for movements matching $125,000 (+/- 5%)...');
  
  const { data: movements, error: mError } = await supabase
    .from('movimientos_tesoreria')
    .select('*, entidades(razon_social)')
    .gte('monto_total', 110000)
    .lte('monto_total', 140000)
    .order('fecha', { ascending: false });

  if (mError) {
    console.error('Error:', mError);
    return;
  }

  console.log(`Found ${movements.length} candidate movements:`);
  movements.forEach(m => {
    console.log(`- ID: ${m.id}, Fecha: ${m.fecha}, Monto: ${m.monto_total}, Entidad: ${m.entidades?.razon_social}, Tipo: ${m.tipo}`);
  });

  console.log('\nChecking all "cobro" movements in April...');
  const { data: aprilCobros, error: aError } = await supabase
    .from('movimientos_tesoreria')
    .select('*, entidades(razon_social)')
    .eq('tipo', 'cobro')
    .gte('fecha', '2026-04-01')
    .lte('fecha', '2026-04-30');

  if (aError) {
    console.error('Error:', aError);
    return;
  }

  console.log(`Found ${aprilCobros.length} cobros in April:`);
  aprilCobros.forEach(m => {
    console.log(`- ID: ${m.id}, Fecha: ${m.fecha}, Monto: ${m.monto_total}, Entidad: ${m.entidades?.razon_social}`);
  });
}

findMovement();
