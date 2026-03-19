import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Helper to parse CSV (simplified for server environment)
function parseCSVFromPath(filePath: string) {
    if (!fs.existsSync(filePath)) return []
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    let headerIdx = 0
    while (headerIdx < lines.length) {
        if (lines[headerIdx].split(',').length >= 2) break
        headerIdx++
    }
    if (headerIdx >= lines.length) return []
    const headers = lines[headerIdx].toLowerCase().split(',').map(h => h.trim())
    return lines.slice(headerIdx + 1)
        .filter(line => line.trim() !== '' && line.split(',').length >= 2)
        .map(line => {
            const values = line.split(',')
            const obj: any = {}
            headers.forEach((h, i) => {
                let val = values[i]
                if (val !== undefined) {
                    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
                    obj[h] = val.trim()
                }
            })
            return obj
        })
}

export async function POST() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Get Org ID
        const { getOrgId } = await import('@/lib/supabase/utils')
        const orgId = await getOrgId(supabase, user.id)

        console.log(`🚀 Resetting test data for Org: ${orgId}`)

        // 1. Clear Data
        await supabase.from('aplicaciones_pago').delete().eq('organization_id', orgId)
        await supabase.from('transacciones').delete().eq('organization_id', orgId)
        await supabase.from('instrumentos_pago').delete().eq('organization_id', orgId)
        await supabase.from('movimientos_tesoreria').delete().eq('organization_id', orgId)
        await supabase.from('comprobantes').delete().eq('organization_id', orgId)
        await supabase.from('entidades').delete().eq('organization_id', orgId)

        // 2. Load Data from CSVs (relative to project root)
        const baseDir = process.cwd()
        const entitiesData = parseCSVFromPath(path.join(baseDir, 'test_data', 'entidades.csv'))
        const invoicesData = parseCSVFromPath(path.join(baseDir, 'test_data', 'ventas_ingresos.csv'))
        const receiptsData = parseCSVFromPath(path.join(baseDir, 'test_data', 'recibos.csv'))
        const bankData = parseCSVFromPath(path.join(baseDir, 'test_data', 'extracto_galicia_demo.csv'))

        // Insert Entities
        if (entitiesData.length > 0) {
            await supabase.from('entidades').insert(entitiesData.map(e => ({
                id: e.id,
                organization_id: orgId,
                razon_social: e.razon_social,
                cuit: e.cuit,
                tipo_entidad: 'cliente'
            })))
        }

        // Insert Invoices
        if (invoicesData.length > 0) {
            await supabase.from('comprobantes').insert(invoicesData.map(inv => ({
                organization_id: orgId,
                entidad_id: inv.entidad_id,
                tipo: inv.tipo,
                nro_factura: inv.numero,
                fecha_emision: inv.fecha,
                monto_total: parseFloat(inv.monto),
                monto_pendiente: parseFloat(inv.monto),
                estado: 'pendiente'
            })))
        }

        // Insert Treasury & Instruments
        for (const rec of receiptsData) {
            const { data: mov } = await supabase.from('movimientos_tesoreria').insert({
                organization_id: orgId,
                entidad_id: rec.entidad_id,
                tipo: 'cobro',
                fecha: rec.fecha,
                monto_total: parseFloat(rec.monto),
                nro_comprobante: rec.numero,
                concepto: 'Recibo de Prueba'
            }).select().single()

            if (mov) {
                await supabase.from('instrumentos_pago').insert({
                    organization_id: orgId,
                    movimiento_id: mov.id,
                    tipo_instrumento: rec.medio_pago,
                    monto: parseFloat(rec.monto),
                    detalle_referencia: rec.referencia,
                    estado: 'pendiente'
                })
            }
        }

        // Insert Bank Transactions
        if (bankData.length > 0) {
            await supabase.from('transacciones').insert(bankData.map(t => ({
                organization_id: orgId,
                fecha: t.fecha.split('/').reverse().join('-'),
                descripcion: t.concepto,
                monto: parseFloat(t.credito || '0') - parseFloat(t.debito || '0'),
                estado: 'pendiente'
            })))
        }

        // 3. Run Reconcile Engine
        const { data: rpcResult, error: rpcError } = await supabase.rpc('reconcile_v3_1', { 
            p_org_id: orgId,
            p_dry_run: false
        })

        return NextResponse.json({ 
            success: true, 
            message: 'Datos reseteados y cargados correctamente',
            reconciliation: rpcResult || { error: rpcError }
        })

    } catch (error: any) {
        console.error('Error in reset-test:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
