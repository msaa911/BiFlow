
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get Org ID
    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'No org' }, { status: 404 })

    const orgId = member.organization_id

    const { mode } = await request.json().catch(() => ({}));

    try {
        if (mode === 'full_reset') {
            await performFullReset(supabase, orgId);
            return NextResponse.json({ success: true, message: 'Todos los datos han sido eliminados.' })
        }

        if (mode === 'delete_clients') {
            // 1. Delete records that are only clients
            const { error: delErr } = await supabase
                .from('entidades')
                .delete()
                .eq('organization_id', orgId)
                .eq('categoria', 'cliente')
            if (delErr) throw delErr

            // 2. Downgrade 'ambos' to 'proveedor'
            const { error: updErr } = await supabase
                .from('entidades')
                .update({ categoria: 'proveedor' })
                .eq('organization_id', orgId)
                .eq('categoria', 'ambos')
            if (updErr) throw updErr

            return NextResponse.json({ success: true, message: 'Todos los clientes han sido eliminados.' })
        }

        if (mode === 'delete_suppliers') {
            // 1. Delete records that are only suppliers
            const { error: delErr } = await supabase
                .from('entidades')
                .delete()
                .eq('organization_id', orgId)
                .eq('categoria', 'proveedor')
            if (delErr) throw delErr

            // 2. Downgrade 'ambos' to 'cliente'
            const { error: updErr } = await supabase
                .from('entidades')
                .update({ categoria: 'cliente' })
                .eq('organization_id', orgId)
                .eq('categoria', 'ambos')
            if (updErr) throw updErr

            return NextResponse.json({ success: true, message: 'Todos los proveedores han sido eliminados.' })
        }

        // 1. Delete transactions with null archivo_importacion_id (orphans that cause duplicates)
        const { error: transErr } = await supabase
            .from('transacciones')
            .delete()
            .eq('organization_id', orgId)
            .is('archivo_importacion_id', null)

        if (transErr) throw transErr

        return NextResponse.json({ success: true, message: 'Registros huérfanos eliminados.' })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'No org' }, { status: 404 })

    const orgId = member.organization_id

    try {
        await performFullReset(supabase, orgId);
        return NextResponse.json({ success: true, message: 'Entorno reiniciado con éxito.' })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

async function performFullReset(supabase: any, orgId: string) {
    console.log(`[PURGE] Starting full reset for org: ${orgId}`);
    const results: { table: string, success: boolean, count?: number, error?: string, ignored?: boolean }[] = [];

    const tables = [
        'hallazgos_auditoria',
        'hallazgos',
        'aplicaciones_pago',
        'instrumentos_pago',
        'movimientos_tesoreria',
        'pagos_proyectados',
        'transacciones',
        'comprobantes',
        'reglas_fiscales_ia',
        'configuracion_impuestos',
        'configuracion_empresa',
        'convenios_bancarios',
        'archivos_importados',
        'trust_ledger',
        'entidades',
        'cuentas_bancarias',
        'financial_thesaurus'
    ];

    for (const table of tables) {
        try {
            const { error, count } = await supabase
                .from(table)
                .delete({ count: 'exact' })
                .eq('organization_id', orgId);

            if (error) {
                const isMinor = error.message.includes('Could not find the table') ||
                    error.message.includes('does not exist') ||
                    error.code === 'PGRST116' || // Not found
                    error.code === '42P01';      // Undefined table

                results.push({
                    table,
                    success: isMinor,
                    error: error.message,
                    ignored: isMinor
                });
            } else {
                results.push({ table, success: true, count: count || 0 });
            }
        } catch (e: any) {
            results.push({ table, success: false, error: e.message });
        }
    }

    // Fail if ALL tables failed (sign of a critical connection/auth issue)
    const successCount = results.filter(r => r.success).length;
    if (successCount === 0 && tables.length > 0) {
        throw new Error(`Fallo crítico: No se pudo limpiar ninguna tabla.`);
    }

    return results;
}
