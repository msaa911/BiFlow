import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const supabase = await createClient();

    const { data: trans } = await supabase.from('transacciones').select().limit(1);
    const { data: comp } = await supabase.from('comprobantes').select().limit(1);
    const { data: ent } = await supabase.from('entidades').select().limit(1);

    return NextResponse.json({
        transacciones: trans && trans.length > 0 ? Object.keys(trans[0]) : [],
        comprobantes: comp && comp.length > 0 ? Object.keys(comp[0]) : [],
        entidades: ent && ent.length > 0 ? Object.keys(ent[0]) : []
    });
}
