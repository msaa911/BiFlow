import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function listEntidades() {
  console.log('Listing entities...');
  const { data, error } = await supabase
    .from('entidades')
    .select('id, razon_social, fantasy_name, cuit, tipo_entidad');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data.length} entities:`);
  data.forEach(e => {
    console.log(`- ${e.razon_social} | ${e.fantasy_name} | CUIT: ${e.cuit} | Tipo: ${e.tipo_entidad}`);
  });
}

listEntidades();
