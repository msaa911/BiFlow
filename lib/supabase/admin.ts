import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with service role privileges.
 * This client bypasses RLS and should only be used in server-side contexts (API routes).
 * It handles the different environment variable names used in the project.
 */
export function createAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing Supabase environment variables for admin client');
    }

    return createClient(supabaseUrl, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}
