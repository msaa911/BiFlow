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

        const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
        const serviceSupabase = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Fetch the pattern
        const { data: rule } = await serviceSupabase
            .from('reglas_fiscales_ia')
            .select('patron_busqueda')
            .eq('id', id)
            .single()

        if (rule) {
            console.log(`[CLASSIFY] Cleaning up tags for pattern: ${rule.patron_busqueda}`)

            const { data: transactions } = await serviceSupabase
                .from('transacciones')
                .select('id, tags')
                .eq('organization_id', organization_id)
                .ilike('descripcion', `%${rule.patron_busqueda}%`)

            if (transactions && transactions.length > 0) {
                for (const t of transactions) {
                    let tags = t.tags || []

                    // Always remove pending tags
                    tags = tags.filter((tag: string) =>
                        tag !== 'pendiente_clasificacion' && tag !== 'servicio_detectado' && tag !== 'costo_impositivo' && tag !== 'gasto_simple'
                    )

                    // If it's recoverable, add the tag
                    if (es_recuperable && !tags.includes('impuesto_recuperable')) {
                        tags.push('impuesto_recuperable')
                    } else if (!es_recuperable) {
                        // Remove recoverable tag if it was there (editing a rule)
                        tags = tags.filter((tag: string) => tag !== 'impuesto_recuperable')

                        // Add specific "cost" tag
                        const costTag = rule.categoria === 'servicio' ? 'gasto_simple' : 'costo_impositivo'
                        if (!tags.includes(costTag)) {
                            tags.push(costTag)
                        }
                    }

                    await serviceSupabase.from('transacciones').update({ tags }).eq('id', t.id)
                }
            }
        }

        const { error } = await serviceSupabase
            .from('reglas_fiscales_ia')
            .update({
                es_recuperable,
                omitir_siempre,
                estado
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
