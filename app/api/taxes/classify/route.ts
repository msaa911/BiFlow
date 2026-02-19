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

        // Fetch the pattern to clean up existing transactions
        const { data: rule } = await supabase
            .from('tax_intelligence_rules')
            .select('patron_busqueda')
            .eq('id', id)
            .single()

        if (rule) {
            console.log(`[CLASSIFY] Cleaning up tags for pattern: ${rule.patron_busqueda}`)

            // 1. Get all transactions with this pattern and tags
            const { data: transactions } = await supabase
                .from('transacciones')
                .select('id, tags')
                .eq('organization_id', organization_id)
                .ilike('descripcion', `%${rule.patron_busqueda}%`)

            if (transactions && transactions.length > 0) {
                for (const t of transactions) {
                    if (t.tags && (t.tags.includes('pendiente_clasificacion') || t.tags.includes('servicio_detectado'))) {
                        const newTags = t.tags.filter((tag: string) =>
                            tag !== 'pendiente_clasificacion' && tag !== 'servicio_detectado'
                        )
                        await supabase.from('transacciones').update({ tags: newTags }).eq('id', t.id)
                    }
                }
            }
        }

        const { error } = await supabase
            .from('tax_intelligence_rules')
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
