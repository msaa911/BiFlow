
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Organization
    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json([])

    const { data: files, error } = await supabase
        .from('archivos_importados')
        .select('*')
        .eq('organization_id', member.organization_id)
        .order('fecha_carga', { ascending: false })
        .limit(20)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Enrich with quarantine counts
    const enriched = await Promise.all(files.map(async (f) => {
        const { count } = await supabase
            .from('transacciones_revision')
            .select('*', { count: 'exact', head: true })
            .eq('archivo_importacion_id', f.id)

        return {
            ...f,
            quarantine_count: count || 0
        }
    }))

    return NextResponse.json(enriched)
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 1. Delete associated transactions (Rollback)
    const { error: transError } = await supabase
        .from('transacciones')
        .delete()
        .eq('archivo_importacion_id', id)

    if (transError) console.error('Error deleting transactions:', transError)

    // 2. Delete associated quarantine items
    const { error: quarantineError } = await supabase
        .from('transacciones_revision')
        .delete()
        .eq('archivo_importacion_id', id)

    if (quarantineError) console.error('Error deleting quarantine:', quarantineError)

    // 3. Mark as reverted (or delete log? User asked to "eliminar"). 
    // Let's delete the log entirely to clean up the history as requested.
    // OR keep it as 'revertido' for audit? 
    // The user said "liminar las importaciones". I will DELETE the log row.
    const { error: logError } = await supabase
        .from('archivos_importados')
        .delete()
        .eq('id', id)

    if (logError) return NextResponse.json({ error: logError.message }, { status: 500 })

    return NextResponse.json({ success: true })
}
