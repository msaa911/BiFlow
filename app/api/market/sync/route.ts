import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
    try {
        const supabase = await createClient()

        // Llamar a la Edge Function de Supabase
        const { data, error } = await supabase.functions.invoke('sync-bcra-rates')

        if (error) {
            console.error("❌ Error invoking sync-bcra-rates:", error)
            // Si es un error de la función, intentamos obtener el cuerpo del error si existe
            return NextResponse.json({
                error: error.message || 'Error en Edge Function',
                details: error
            }, { status: 500 })
        }

        return NextResponse.json(data)
    } catch (err: any) {
        console.error("❌ API Market Sync Exception:", err)
        return NextResponse.json({
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: 500 })
    }
}
