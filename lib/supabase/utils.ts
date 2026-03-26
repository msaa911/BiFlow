import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function getOrgId(supabase: any, userId: string): Promise<string> {
    // 0. CHECK IMPERSONATION (MODO DIOS) 
    // This allows admins to view data from other organizations using a secure cookie.
    try {
        const cookieStore = cookies();
        const impersonatedOrgId = cookieStore.get('biflow_impersonation')?.value;

        if (impersonatedOrgId) {
            // SECURITY: Verify the requester is actually an admin before honoring the cookie.
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();

            if (profile && ['admin', 'superadmin'].includes(profile.role)) {
                return impersonatedOrgId;
            }
        }
    } catch (error) {
        // Handlers where cookies() are not available (like internal client-side utilities)
        // or execution outside of request context. 
    }

    // 1. Try with the provided client (standard RLS)
    const { data: member, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle()

    if (!error && member) {
        return member.organization_id
    }

    // 2. Fallback: Use service role if available (Server-only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && serviceRoleKey) {
        const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey)
        const { data: adminMember } = await adminClient
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', userId)
            .maybeSingle()

        if (adminMember) return adminMember.organization_id
    }

    console.warn(`No organization linked to user ${userId}. Returning empty.`)
    return '' // Return empty to force a clean slate for new users
}
