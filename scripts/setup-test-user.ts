import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function setupTestUser() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const email = 'test_reconcile@biflow.com';
  const password = 'Password123!';

  // 1. Create User
  const { data: { user }, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (userError && !userError.message.includes('already registered')) {
    console.error('Error creating user:', userError);
    return;
  }

  const targetUser = user || (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === email);
  
  if (!targetUser) {
    console.error('User not found after creation attempt.');
    return;
  }

  console.log(`User ${email} is ready. ID: ${targetUser.id}`);

  // 2. Ensure Organization exists and user is a member
  // First, check for any existing org
  const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
  let orgId;

  if (orgs && orgs.length > 0) {
    orgId = orgs[0].id;
  } else {
    const { data: newOrg } = await supabase.from('organizations').insert({ name: 'Test Org' }).select().single();
    orgId = newOrg?.id;
  }

  if (orgId) {
    const { error: memberError } = await supabase.from('organization_members').upsert({
      organization_id: orgId,
      user_id: targetUser.id,
      role: 'admin'
    });
    if (memberError) console.error('Error adding member:', memberError);
    else console.log(`Linked to Org: ${orgId}`);
  }
}

setupTestUser();
