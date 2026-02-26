
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

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })

    const { nombre_archivo, metadata } = await request.json()
    if (!nombre_archivo) return NextResponse.json({ error: 'Missing nombre_archivo' }, { status: 400 })

    // Use service role to bypass RLS
    const { createClient: createServiceClient } = require('@supabase/supabase-js')
    const adminClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: importLog, error } = await adminClient
        .from('archivos_importados')
        .insert({
            organization_id: member.organization_id,
            nombre_archivo,
            estado: 'procesando',
            metadata: metadata || {}
        })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(importLog)
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Use service role client to bypass RLS for admin delete operations
    const { createClient: createServiceClient } = require('@supabase/supabase-js')
    const adminClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        // 1. Delete associated bank transactions
        await adminClient.from('transacciones').delete().eq('archivo_importacion_id', id)

        // 2. Delete associated quarantine items
        await adminClient.from('transacciones_revision').delete().eq('archivo_importacion_id', id)

        // 3. Delete associated invoices (comprobantes)
        await adminClient.from('comprobantes').delete().eq('archivo_importacion_id', id)

        // 4. Delete associated treasury movements (via metadata search)
        const { data: treasuryMovs } = await adminClient
            .from('movimientos_tesoreria')
            .select('id')
            .contains('metadata', { archivo_importacion_id: id })

        if (treasuryMovs && treasuryMovs.length > 0) {
            const movIds = treasuryMovs.map((m: any) => m.id)
            await adminClient.from('instrumentos_pago').delete().in('movimiento_id', movIds)
            await adminClient.from('aplicaciones_pago').delete().in('movimiento_id', movIds)
            await adminClient.from('movimientos_tesoreria').delete().in('id', movIds)
        }

        // 5. Get storage path before deleting the record
        const { data: fileRecord } = await adminClient
            .from('archivos_importados')
            .select('storage_path')
            .eq('id', id)
            .single()

        // 6. Delete the file record itself
        const { error: logError } = await adminClient
            .from('archivos_importados')
            .delete()
            .eq('id', id)

        if (logError) {
            return NextResponse.json({ error: `DB Error: ${logError.message}` }, { status: 500 })
        }

        // 7. Delete from Storage (best effort)
        if (fileRecord?.storage_path) {
            await adminClient.storage.from('raw-imports').remove([fileRecord.storage_path])
        }

        return NextResponse.json({ success: true })
    } catch (err: any) {
        console.error('[IMPORTS DELETE] Error:', err)
        return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
    }
}

export async function PATCH(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, estado, metadata } = await request.json()
    if (!id || !estado) return NextResponse.json({ error: 'Missing id or estado' }, { status: 400 })

    // Use service role to bypass RLS for state updates
    const { createClient: createServiceClient } = require('@supabase/supabase-js')
    const adminClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await adminClient
        .from('archivos_importados')
        .update({ estado, metadata })
        .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
}
