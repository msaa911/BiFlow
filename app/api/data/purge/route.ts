
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function DELETE(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Organization
    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const orgId = member.organization_id

    try {
        console.log(`[PURGE] Starting global reset for org: ${orgId}`)

        // 1. Delete Findings (Audit)
        await supabase.from('hallazgos').delete().eq('organization_id', orgId)
        await supabase.from('hallazgos_auditoria').delete().eq('organization_id', orgId)

        // 2. Delete Treasury data (comprobantes) - The "Ghost" data
        await supabase.from('comprobantes').delete().eq('organization_id', orgId)

        // 3. Delete Tax Rules (IA Learning)
        await supabase.from('configuracion_impuestos').delete().eq('organization_id', orgId)

        // 4. Delete Transactions & Files (Cascades usually handle transactions, but let's be explicit if needed)
        // transacciones has archivo_importacion_id, deleting files should clear them if FK is set to cascade.
        // But some transactions might not have a file id if manually entered (future-proofing).
        await supabase.from('transacciones').delete().eq('organization_id', orgId)
        await supabase.from('transacciones_revision').delete().eq('organization_id', orgId)
        await supabase.from('archivos_importados').delete().eq('organization_id', orgId)

        // 5. Cleanup Storage
        const { data: files } = await supabase.storage.from('raw-imports').list(orgId)
        if (files && files.length > 0) {
            const paths = files.map(f => `${orgId}/${f.name}`)
            await supabase.storage.from('raw-imports').remove(paths)
        }

        console.log(`[PURGE] Completed global reset for org: ${orgId}`)
        return NextResponse.json({ success: true, message: 'All organizational data has been reset.' })

    } catch (error: any) {
        console.error('[PURGE] Fatal Error:', error)
        return NextResponse.json({ error: 'Failed to purge data', details: error.message }, { status: 500 })
    }
}
