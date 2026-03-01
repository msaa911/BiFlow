import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
    try {
        const supabase = await createClient()

        // Llamar a la Edge Function de Supabase
        const { data, error } = await supabase.functions.invoke('sync-bcra-rates')

        if (error) {
            console.error("Error invoking sync-bcra-rates:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(data)
    } catch (err: any) {
        console.error("API Market Sync Error:", err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
