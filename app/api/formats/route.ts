
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get user's org id
    // Ideally extract this to a helper as we use it often
    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'No org found' }, { status: 400 })

    const { data: formats, error } = await supabase
        .from('formato_archivos')
        .select('*')
        .eq('organization_id', member.organization_id)
        .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(formats)
}

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'No org found' }, { status: 400 })

    try {
        const body = await request.json()
        const { nombre, tipo, reglas, descripcion } = body

        if (!nombre || !reglas) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('formato_archivos')
            .insert({
                organization_id: member.organization_id,
                nombre,
                tipo: tipo || 'fixed_width',
                reglas,
                descripcion
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    const supabase = await createClient()
    const { error } = await supabase.from('formato_archivos').delete().eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
}
