import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { id, organization_id, es_recuperable, omitir_siempre, action } = await req.json()

        // Map actions to state
        let estado = 'CLASIFICADO'
        if (action === 'IGNORE_PERMANENT') {
            estado = 'IGNORADO'
        } else if (action === 'LATER') {
            // Just return, we don't save anything to the DB for "ask later"
            return NextResponse.json({ success: true, action: 'later' })
        }

        const { error } = await supabase
            .from('configuracion_impuestos')
            .update({
                es_recuperable,
                omitir_siempre,
                estado,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('organization_id', organization_id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error classifying tax:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
