import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEntidad() {
  console.log('Searching for "CLIENTE PRUEBA"...');
  const { data: entidades, error: eError } = await supabase
    .from('entidades')
    .select('*')
    .ilike('razon_social', '%CLIENTE PRUEBA%');

  if (eError || !entidades || entidades.length === 0) {
    console.log('Entidad not found.');
    return;
  }

  const entidad = entidades[0];
  console.log(`Found Entidad: ${entidad.razon_social} (ID: ${entidad.id})`);

  console.log('\nSearching for movements related to this entity...');
  const { data: movements, error: mError } = await supabase
    .from('movimientos_tesoreria')
    .select('*, instrumentos_pago(*)')
    .eq('entidad_id', entidad.id);

  if (mError) {
    console.error('Error:', mError);
    return;
  }

  console.log(`Found ${movements.length} movements:`);
  movements.forEach(m => {
    console.log(`- ID: ${m.id}, Fecha: ${m.fecha}, Monto Total: ${m.monto_total}, Tipo: ${m.tipo}`);
    m.instrumentos_pago?.forEach(i => {
      console.log(`  > Instrumento: ${i.metodo}, Monto: ${i.monto}, Ref: ${i.detalle_referencia}`);
    });
  });
}

checkEntidad();
