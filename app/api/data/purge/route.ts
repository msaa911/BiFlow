
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
            await performFullReset(supabase, orgId);
            return NextResponse.json({ success: true, message: 'Todos los datos han sido eliminados.' })
        }

        if (mode === 'delete_clients') {
            // 1. Delete records that are only clients
            const { error: delErr } = await supabase
                .from('entidades')
                .delete()
                .eq('organization_id', orgId)
                .eq('categoria', 'cliente')
            if (delErr) throw delErr

            // 2. Downgrade 'ambos' to 'proveedor'
            const { error: updErr } = await supabase
                .from('entidades')
                .update({ categoria: 'proveedor' })
                .eq('organization_id', orgId)
                .eq('categoria', 'ambos')
            if (updErr) throw updErr

            return NextResponse.json({ success: true, message: 'Todos los clientes han sido eliminados.' })
        }

        if (mode === 'delete_suppliers') {
            // 1. Delete records that are only suppliers
            const { error: delErr } = await supabase
                .from('entidades')
                .delete()
                .eq('organization_id', orgId)
                .eq('categoria', 'proveedor')
            if (delErr) throw delErr

            // 2. Downgrade 'ambos' to 'cliente'
            const { error: updErr } = await supabase
                .from('entidades')
                .update({ categoria: 'cliente' })
                .eq('organization_id', orgId)
                .eq('categoria', 'ambos')
            if (updErr) throw updErr

            return NextResponse.json({ success: true, message: 'Todos los proveedores han sido eliminados.' })
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

export async function DELETE(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'No org' }, { status: 404 })

    const orgId = member.organization_id

    try {
        await performFullReset(supabase, orgId);
        return NextResponse.json({ success: true, message: 'Entorno reiniciado con éxito.' })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

async function performFullReset(supabase: any, orgId: string) {
    // 1. Delete findings (hallazgos) first as they might depend on transactions
    await supabase.from('hallazgos').delete().eq('organization_id', orgId)

    // 2. Delete transactions and comprobantes
    await supabase.from('transacciones').delete().eq('organization_id', orgId)
    await supabase.from('comprobantes').delete().eq('organization_id', orgId)

    // 3. Delete AI rules
    await supabase.from('tax_intelligence_rules').delete().eq('organization_id', orgId)

    // 4. Delete import logs
    await supabase.from('archivos_importados').delete().eq('organization_id', orgId)

    // 5. Delete financial thesaurus (custom patterns)
    await supabase.from('financial_thesaurus').delete().eq('organization_id', orgId)

    // 6. Delete all entities (Socios)
    await supabase.from('entidades').delete().eq('organization_id', orgId)
}
