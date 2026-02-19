import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient()
        const { id } = params
        const { estado } = await request.json()

        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

        // 1. Update finding status
        const { data: finding, error: updateError } = await supabase
            .from('hallazgos')
            .update({ estado })
            .eq('id', id)
            .select('*, transaccion:transacciones(*)')
            .single()

        if (updateError) throw updateError

        // 2. Special Logic for Duplicates: If resolved, we might want to tag the transaction
        if (estado === 'resuelto' && finding.tipo === 'duplicado') {
            const currentTags = finding.transaccion.tags || []
            if (!currentTags.includes('duplicado_resuelto')) {
                await supabase
                    .from('transacciones')
                    .update({
                        tags: [...currentTags, 'duplicado_resuelto']
                    })
                    .eq('id', finding.transaccion_id)
            }
        }

        return NextResponse.json({ success: true, finding })

    } catch (error) {
        console.error('Error updating finding:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
