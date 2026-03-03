
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function getOrgId(supabase: any, userId: string): Promise<string> {
    // 1. Try with the provided client (standard RLS)
    const { data: member, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .single()

    if (!error && member) {
        return member.organization_id
    }

    // 2. Fallback: Use service role if available (Server-only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY // Support both common naming conventions

    if (supabaseUrl && serviceRoleKey) {
        const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey)
        const { data: adminMember } = await adminClient
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', userId)
            .single()

        if (adminMember) return adminMember.organization_id

        // Hard fallback to first org (for demo/onboarding)
        const { data: orgs } = await adminClient.from('organizations').select('id').limit(1)
        if (orgs && orgs.length > 0) return orgs[0].id
    }

    console.warn(`Organization not found for user ${userId}. Returning first available if possible.`)
    return '' // Return empty instead of crashing layout
}
