import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with service role privileges.
 * This client bypasses RLS and should only be used in server-side contexts (API routes).
 * It handles the different environment variable names used in the project.
 */
export function createAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (!supabaseUrl) {
        throw new Error('[SECURITY] Missing NEXT_PUBLIC_SUPABASE_URL for admin client');
    }
    if (!serviceKey) {
        throw new Error('[SECURITY_CRITICAL] Missing SUPABASE_SERVICE_ROLE_KEY. Admin client cannot be initialized safely.');
    }

    return createClient(supabaseUrl, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}
