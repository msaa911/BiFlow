import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function findUser() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error('Error listing users:', error);
    return;
  }

  if (users.length > 0) {
    console.log('Found users:');
    users.forEach(u => console.log(`- ${u.email}`));
  } else {
    console.log('No users found.');
  }
}

findUser();
