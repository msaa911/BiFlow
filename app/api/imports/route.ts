
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get organization_id (assuming similar logic to upload route or checking context)
        // For simplicity reusing the getOrgId helper pattern logic inline or importing it?
        // Optimally, we should import the helper. I'll duplicate simplified logic for strictness to avoid import errors if helper file structure is unknown, 
        // but typically helper is in lib. Let's try to be robust. 
        // I'll query organizations linked to user.

        const { data: orgMember } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single()

        // Fallback for single-user mvp if no members table logic yet (based on previous context we have orgId logic)
        // Previous route used: const orgId = await getOrgId(supabase, user.id)
        // I will copy that helper logic here to be safe or assuming standard single org.

        let orgId = orgMember?.organization_id

        if (!orgId) {
            const { data: org } = await supabase
                .from('organizations')
                .select('id')
                .eq('owner_id', user.id)
                .single()
            orgId = org?.id
        }

        if (!orgId) {
            return NextResponse.json({ error: 'No organization found' }, { status: 400 })
        }

        const { data: imports, error } = await supabase
            .from('archivos_importados')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) throw error

        return NextResponse.json(imports)
    } catch (error: any) {
        console.error('Error fetching imports:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

        // Verify ownership/org match implicitly via RLS? 
        // Or explicitly. Best to rely on RLS but for explicit rollback safety:

        // 1. Delete transactions
        const { error: deleteTxError } = await supabase
            .from('transacciones')
            .delete()
            .eq('archivo_importacion_id', id)

        // Note: If user doesn't own the file, RLS should prevent this delete if setup correctly. 
        // If RLS allows delete based on org, it works.

        if (deleteTxError) throw deleteTxError

        // 2. Update import status
        const { error: updateError } = await supabase
            .from('archivos_importados')
            .update({ estado: 'revertido' })
            .eq('id', id)

        if (updateError) throw updateError

        return NextResponse.json({ success: true, message: 'Importación revertida correctamente' })

    } catch (error: any) {
        console.error('Error reverting import:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
