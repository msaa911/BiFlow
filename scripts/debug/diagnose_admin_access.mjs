import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function diagnose() {
  const targetEmail = 'miguelhsaa@gmail.com'
  console.log(`Diagnosing access for: ${targetEmail}`)

  // 1. Find user in auth.users
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers()
  
  if (authError) {
    console.error('Error listing auth users:', authError)
    return
  }

  const user = users.find(u => u.email === targetEmail)
  if (!user) {
    console.error(`User with email ${targetEmail} not found in auth.users`)
    return
  }

  console.log(`Found Auth User: ID=${user.id}, Email=${user.email}`)

  // 2. Find profile in public.profiles
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('Error fetching profile from public.profiles:', profileError)
    
    // Check if table exists
    const { error: tableError } = await supabase.from('profiles').select('count', { count: 'exact', head: true })
    if (tableError) {
      console.error('Does public.profiles table even exist?', tableError)
    }
    return
  }

  console.log('Found Profile Data:', profile)

  if (profile.role === 'superadmin' || profile.role === 'admin') {
    console.log('SUCCESS: User HAS admin role in database.')
  } else {
    console.log(`FAILURE: User role is "${profile.role}", which is NOT allowed for /admin path.`)
    console.log(`FIX: Run: UPDATE public.profiles SET role = 'superadmin' WHERE id = '${user.id}';`)
  }
}

diagnose()
