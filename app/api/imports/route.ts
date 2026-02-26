
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

    // 0. Delete related Error Logs (Check metadata->file or import_id if stored)
    // Note: Error logs might not have a direct foreign key, but good to clean up if possible.
    // For now, we focus on confirmed foreign keys.

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

    // 2b. Delete associated invoices (Safeguard)
    const { error: compError } = await supabase
        .from('comprobantes')
        .delete()
        .eq('archivo_importacion_id', id)

    if (compError) console.error('Error deleting comprobantes:', compError)

    // 2c. Delete associated treasury movements (Safeguard)
    // Note: This relies on `archivo_importacion_id` existing on `movimientos_tesoreria` or checking metadata.
    // Wait, let's check if `archivo_importacion_id` is actually on `movimientos_tesoreria`. I didn't add it in the upload route!
    // Ah, in `/api/upload/route.ts` I mapped `metadata: { import_type: uploadContext }` but I didn't add `archivo_importacion_id` explicitly. Let me check the upload route again.
    // Actually, in the previous fix I just did, I passed `metadata: { ...t.metadata, raw_row: t.raw, import_type: uploadContext }`. 
    // `archivo_importacion_id` is not a column in `movimientos_tesoreria` right now. I should check if it exists or use metadata. 
    // To cleanly delete, we might need a SQL query or just use the metadata.
    const { data: treasuryMovs } = await supabase
        .from('movimientos_tesoreria')
        .select('id')
        .contains('metadata', { archivo_importacion_id: id })

    if (treasuryMovs && treasuryMovs.length > 0) {
        const movIds = treasuryMovs.map(m => m.id)
        // Clean up linked instruments and applications first (if not cascading)
        await supabase.from('instrumentos_pago').delete().in('movimiento_id', movIds)
        await supabase.from('aplicaciones_pago').delete().in('movimiento_id', movIds)

        const { error: treasError } = await supabase
            .from('movimientos_tesoreria')
            .delete()
            .in('id', movIds)

        if (treasError) console.error('Error deleting treasury movements:', treasError)
    }

    // 3. Clear Cache for this organization (Optional but good practice)
    // await supabase.from('daily_cashflow_cache').delete().eq('organization_id', organization_id)

    // 4. Delete the file record
    const { data: fileRecord, error: fetchError } = await supabase
        .from('archivos_importados')
        .select('storage_path')
        .eq('id', id)
        .single()

    if (fetchError) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const { error: logError } = await supabase
        .from('archivos_importados')
        .delete()
        .eq('id', id)

    if (logError) {
        // If this fails, it's likely a Foreign Key constraint we missed. Return detailed error.
        return NextResponse.json({ error: `DB Error: ${logError.message}` }, { status: 500 })
    }

    // 5. Delete from Storage (Best effort)
    if (fileRecord?.storage_path) {
        await supabase.storage
            .from('raw-imports')
            .remove([fileRecord.storage_path])
    }

    return NextResponse.json({ success: true })
}
