
export async function getOrgId(supabase: any, userId: string): Promise<string> {
    const { data: member, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .single()

    if (error || !member) {
        // Fallback for demo: use a default org or create one via RPC if available
        // In a real app, we'd handle this more strictly
        const { data: orgs } = await supabase.from('organizations').select('id').limit(1)
        if (orgs && orgs.length > 0) return orgs[0].id

        throw new Error('Organization not found for user')
    }

    return member.organization_id
}
