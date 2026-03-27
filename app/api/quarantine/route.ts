
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/supabase/utils'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get Org ID using the utility that respects Impersonation (Modo Dios)
    const orgId = await getOrgId(supabase, user.id)
    if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 })

    const { data, error } = await supabase
        .from('transacciones_revision')
        .select('*')
        .eq('organization_id', orgId)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
}

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { id, action, data } = body
    // action: 'approve' | 'reject'

    if (!id || !action) return NextResponse.json({ error: 'Missing id or action' }, { status: 400 })

    if (action === 'reject') {
        const { error } = await supabase
            .from('transacciones_revision')
            .update({ estado: 'rechazado' })
            .eq('id', id)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
    }

    if (action === 'approve') {
        // 1. Get the review item to verify ownership and double check
        const { data: reviewItem } = await supabase.from('transacciones_revision').select('*').eq('id', id).single()
        if (!reviewItem) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

        // 2. Validate data provided (fecha, monto, descripcion)
        const { fecha, descripcion, monto } = data
        if (!fecha || !monto || !descripcion) {
            return NextResponse.json({ error: 'Datos incompletos para aprobar' }, { status: 400 })
        }

        // 3. Insert into transactions
        const { error: insertError } = await supabase.from('transacciones').insert({
            organization_id: reviewItem.organization_id,
            archivo_importacion_id: reviewItem.archivo_importacion_id,
            fecha,
            descripcion,
            monto: parseFloat(monto),
            origen_dato: 'quarantine_approved',
            moneda: 'ARS',
            estado: 'pendiente'
        })

        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

        // 4. Update review item to approved
        await supabase.from('transacciones_revision').update({ estado: 'aprobado' }).eq('id', id)

        return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
