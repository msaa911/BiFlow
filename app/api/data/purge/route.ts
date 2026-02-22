
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get Org ID
    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'No org' }, { status: 404 })

    const orgId = member.organization_id

    const { mode } = await request.json().catch(() => ({}));

    try {
        if (mode === 'full_reset') {
            // Dangerous: Wipe all transactions and imports for this org
            await supabase.from('transacciones').delete().eq('organization_id', orgId)
            await supabase.from('comprobantes').delete().eq('organization_id', orgId)
            await supabase.from('archivos_importados').delete().eq('organization_id', orgId)
            return NextResponse.json({ success: true, message: 'Todos los datos han sido eliminados.' })
        }

        // 1. Delete transactions with null archivo_importacion_id (orphans that cause duplicates)
        const { error: transErr } = await supabase
            .from('transacciones')
            .delete()
            .eq('organization_id', orgId)
            .is('archivo_importacion_id', null)

        if (transErr) throw transErr

        return NextResponse.json({ success: true, message: 'Registros huérfanos eliminados.' })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
