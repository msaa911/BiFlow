
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
    const serviceRoleKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && serviceRoleKey) {
        const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey)
        const { data: adminMember } = await adminClient
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', userId)
            .single()

        if (adminMember) return adminMember.organization_id
    }

    console.warn(`No organization linked to user ${userId}. Returning empty.`)
    return '' // Return empty to force a clean slate for new users
}
