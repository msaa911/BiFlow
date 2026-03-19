
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
    const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
    
    if (!member) return NextResponse.json([])

    const { data: accounts, error } = await supabase
        .from('cuentas_bancarias')
        .select('id, banco_nombre, cbu, moneda, saldo_inicial')
        .eq('organization_id', member.organization_id)
        .order('banco_nombre', { ascending: true })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(accounts || [])
}
