import { createClient as createServiceRoleClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Nuclear Purge API - Used to reset the test environment
export async function DELETE(request: Request) {
    // 1. Authenticate the user session first
    const sessionClient = await createClient()
    const { data: { user } } = await sessionClient.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Get the organization ID from the session (bound by RLS)
    const { data: member } = await sessionClient
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

    if (!member) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    const orgId = member.organization_id

    // 3. Create a service role client to perform the actual deletion
    // This bypasses RLS but only for the specific orgId we just verified
    const supabase = createServiceRoleClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        console.log(`[PURGE] Starting global reset for org: ${orgId}`)

        const tablesToClear = [
            'hallazgos',
            'hallazgos_auditoria',
            'comprobantes',
            'tax_intelligence_rules',
            'transacciones',
            'transacciones_revision',
            'archivos_importados'
        ]

        for (const table of tablesToClear) {
            const { error } = await supabase.from(table).delete().eq('organization_id', orgId)
            if (error && error.code !== 'PGRST205') {
                console.warn(`[PURGE] Warning: Failed to clear ${table}:`, error.message)
            }
        }

        // 4. Cleanup Storage
        const { data: files } = await supabase.storage.from('raw-imports').list(orgId)
        if (files && files.length > 0) {
            const paths = files.map(f => `${orgId}/${f.name}`)
            await supabase.storage.from('raw-imports').remove(paths)
        }

        // 5. Reset Company Settings to Default
        await supabase.from('configuracion_empresa').update({
            tna: 0,
            colchon_liquidez: 0,
            limite_descubierto: 0,
            modo_tasa: 'AUTOMATICO'
        }).eq('organization_id', orgId)

        console.log(`[PURGE] Completed global reset for org: ${orgId}`)
        return NextResponse.json({ success: true, message: 'All organizational data has been reset.' })

    } catch (error: any) {
        console.error('[PURGE] Fatal Error:', error)
        return NextResponse.json({ error: 'Failed to purge data', details: error.message }, { status: 500 })
    }
}
