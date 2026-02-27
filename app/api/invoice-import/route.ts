import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })

    const orgId = member.organization_id

    try {
        const { comprobantes, tipoLabel } = await request.json()
        if (!comprobantes || comprobantes.length === 0) {
            return NextResponse.json({ error: 'No comprobantes provided' }, { status: 400 })
        }

        // Service role client for all DB operations
        const { createClient: createServiceClient } = require('@supabase/supabase-js')
        const admin = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // 1. Create archivos_importados record
        const { data: importLog, error: logError } = await admin
            .from('archivos_importados')
            .insert({
                organization_id: orgId,
                nombre_archivo: `importacion_${tipoLabel}_${new Date().toISOString().split('T')[0]}.xlsx`,
                storage_path: `imports/${orgId}/${tipoLabel}_${Date.now()}.xlsx`,
                estado: 'procesando',
                metadata: { context: tipoLabel, total: comprobantes.length }
            })
            .select()
            .single()

        if (logError) {
            console.error('[INVOICE-IMPORT] Error creating archivos_importados:', logError)
            return NextResponse.json({ error: logError.message }, { status: 500 })
        }

        const importId = importLog.id

        // 2. Insert comprobantes with link
        const compsToInsert = comprobantes.map((inv: any) => {
            // Helper interno para normalizar las fechas que llegan desde el modal
            const nDate = (d: string) => {
                if (!d) return null;
                const clean = String(d).replace(/[^\d/.-]/g, '');
                if (clean.length === 8 && /^\d{8}$/.test(clean)) return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
                const p = clean.split(/[/-]/).filter(x => x.length > 0);
                if (p.length === 3) {
                    let [p1, p2, p3] = p;
                    if (p1.length === 4) return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
                    if (p1.length <= 2 && p3.length >= 2) {
                        if (p3.length === 2) p3 = `20${p3}`;
                        return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
                    }
                }
                return d;
            };

            return {
                organization_id: orgId,
                entidad_id: inv.entidad_id || null,
                archivo_importacion_id: importId,
                tipo: inv.tipo,
                fecha_emision: nDate(inv.fecha_emision),
                fecha_vencimiento: nDate(inv.fecha_vencimiento) || nDate(inv.fecha_emision),
                numero: inv.numero,
                monto_total: inv.monto_total,
                monto_pendiente: inv.monto_pendiente,
                estado: inv.estado || 'pendiente',
                condicion: inv.condicion,
                razon_social_socio: inv.razon_social_socio,
                cuit_socio: inv.cuit_socio
            };
        });

        const { data: insertedComps, error: insertError } = await admin
            .from('comprobantes')
            .insert(compsToInsert)
            .select()

        if (insertError) {
            console.error('[INVOICE-IMPORT] Error inserting comprobantes:', insertError)
            // Mark import as error
            await admin.from('archivos_importados').update({
                estado: 'error',
                metadata: { context: tipoLabel, error: insertError.message }
            }).eq('id', importId)
            return NextResponse.json({ error: insertError.message }, { status: 500 })
        }

        // 3. Handle 'contado' automated payments
        const contadoComps = insertedComps?.filter((c: any) => c.condicion === 'contado') || []
        for (const inv of contadoComps) {
            const isCobro = inv.tipo === 'factura_venta'
            const { data: mov } = await admin.from('movimientos_tesoreria').insert({
                organization_id: orgId,
                entidad_id: inv.entidad_id,
                tipo: isCobro ? 'cobro' : 'pago',
                monto_total: inv.monto_total,
                fecha: inv.fecha_emision,
                observaciones: `Cierre automático (Importación): Contado ${inv.numero || ''}`
            }).select().single()

            if (mov) {
                await admin.from('instrumentos_pago').insert({
                    movimiento_id: mov.id,
                    metodo: 'efectivo',
                    monto: inv.monto_total,
                    fecha_disponibilidad: inv.fecha_emision
                })
                await admin.from('aplicaciones_pago').insert({
                    movimiento_id: mov.id,
                    comprobante_id: inv.id,
                    monto_aplicado: inv.monto_total
                })
            }
        }

        // 4. Mark import as completed
        await admin.from('archivos_importados').update({
            estado: 'completado',
            metadata: { context: tipoLabel, inserted: insertedComps?.length || 0 }
        }).eq('id', importId)

        return NextResponse.json({
            success: true,
            importId,
            count: insertedComps?.length || 0,
            contadoCount: contadoComps.length
        })
    } catch (err: any) {
        console.error('[INVOICE-IMPORT] Fatal error:', err)
        return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 })
    }
}
