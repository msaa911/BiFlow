import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { organization_id, nombre_archivo, metadata } = await request.json()

    if (!organization_id || !nombre_archivo) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify organization membership
    const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('organization_id', organization_id)
        .single()

    if (!member) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Use service role to bypass RLS for logging
    const { createClient: createServiceClient } = require('@supabase/supabase-js')
    const adminClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: importLog, error } = await adminClient
        .from('archivos_importados')
        .insert({
            organization_id,
            nombre_archivo,
            estado: 'completado',
            metadata
        })
        .select()
        .single()

    if (error) {
        console.error('[API/IMPORTS/LOG] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(importLog)
}
