import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Helper to parse CSV (simplified for server environment)
function parseCSVFromPath(filePath: string) {
    if (!fs.existsSync(filePath)) return []
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\r\n').join('\n').split('\n')
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
        const clientesData = parseCSVFromPath(path.join(baseDir, 'test_data', 'clientes.csv'))
        const proveedoresData = parseCSVFromPath(path.join(baseDir, 'test_data', 'proveedores.csv'))
        const ventasData = parseCSVFromPath(path.join(baseDir, 'test_data', 'ventas_ingresos.csv'))
        const comprasData = parseCSVFromPath(path.join(baseDir, 'test_data', 'compras_egresos.csv'))
        const recibosData = parseCSVFromPath(path.join(baseDir, 'test_data', 'recibos.csv'))
        const pagosData = parseCSVFromPath(path.join(baseDir, 'test_data', 'ordenes_pago.csv'))
        const bankData = parseCSVFromPath(path.join(baseDir, 'test_data', 'extracto_macro_demo.csv')) // Usar Macro para probar el caso del usuario

        // Insert Entities (Clientes)
        if (clientesData.length > 0) {
            await supabase.from('entidades').insert(clientesData.map(e => ({
                organization_id: orgId,
                razon_social: e.razon_social,
                cuit: e.cuit,
                tipo_entidad: 'cliente'
            })))
        }
        // Insert Entities (Proveedores)
        if (proveedoresData.length > 0) {
            await supabase.from('entidades').insert(proveedoresData.map(e => ({
                organization_id: orgId,
                razon_social: e.razon_social,
                cuit: e.cuit,
                tipo_entidad: 'proveedor'
            })))
        }

        // Fetch entities back to map by CUIT
        const { data: entities } = await supabase.from('entidades').select('id, cuit').eq('organization_id', orgId)
        const entityMap = new Map(entities?.map(e => [e.cuit, e.id]) || [])

        // Insert Invoices (Ventas)
        if (ventasData.length > 0) {
            await supabase.from('comprobantes').insert(ventasData.map(inv => ({
                organization_id: orgId,
                entidad_id: entityMap.get(inv.cuit) || null,
                tipo: 'factura_venta',
                nro_factura: inv.numero,
                fecha_emision: inv.fecha.split('/').reverse().join('-'),
                monto_total: parseFloat(inv.monto),
                monto_pendiente: parseFloat(inv.monto),
                estado: 'pendiente'
            })))
        }
        // Insert Invoices (Compras)
        if (comprasData.length > 0) {
            await supabase.from('comprobantes').insert(comprasData.map(inv => ({
                organization_id: orgId,
                entidad_id: entityMap.get(inv.cuit) || null,
                tipo: 'factura_compra',
                nro_factura: inv.numero,
                fecha_emision: inv.fecha.split('/').reverse().join('-'),
                monto_total: parseFloat(inv.monto),
                monto_pendiente: parseFloat(inv.monto),
                estado: 'pendiente'
            })))
        }

        // Insert Treasury & Instruments (Recibos)
        for (const rec of recibosData) {
            const { data: mov } = await supabase.from('movimientos_tesoreria').insert({
                organization_id: orgId,
                entidad_id: entityMap.get(rec.cuit) || null,
                tipo: 'cobro',
                fecha: rec.fecha.split('/').reverse().join('-'),
                monto_total: parseFloat(rec.importe),
                nro_comprobante: rec.recibo,
                concepto: 'Recibo Importado'
            }).select().single()

            if (mov) {
                await supabase.from('instrumentos_pago').insert({
                    organization_id: orgId,
                    movimiento_id: mov.id,
                    metodo: rec.medio?.toLowerCase() === 'cheque' ? 'cheque_terceros' : (rec.medio?.toLowerCase() || 'efectivo'),
                    monto: parseFloat(rec.importe),
                    detalle_referencia: rec.detalle,
                    banco: rec.banco,
                    estado: 'pendiente'
                })
            }
        }

        // Insert Treasury & Instruments (Pagos)
        for (const p of pagosData) {
            const { data: mov } = await supabase.from('movimientos_tesoreria').insert({
                organization_id: orgId,
                entidad_id: entityMap.get(p.cuit) || null,
                tipo: 'pago',
                fecha: p.fecha.split('/').reverse().join('-'),
                monto_total: parseFloat(p.importe),
                nro_comprobante: p.orden,
                concepto: 'Orden de Pago Importada'
            }).select().single()

            if (mov) {
                await supabase.from('instrumentos_pago').insert({
                    organization_id: orgId,
                    movimiento_id: mov.id,
                    metodo: p.medio?.toLowerCase().includes('cheque') ? 'cheque_propio' : (p.medio?.toLowerCase() || 'transferencia'),
                    monto: parseFloat(p.importe),
                    detalle_referencia: p.detalle,
                    banco: p.banco,
                    estado: 'pendiente'
                })
            }
        }

        // Insert Bank Transactions
        if (bankData.length > 0) {
            const { data: accounts } = await supabase.from('cuentas_bancarias').select('id').eq('organization_id', orgId).limit(1)
            const defaultAccId = accounts?.[0]?.id

            await supabase.from('transacciones').insert(bankData.map(t => ({
                organization_id: orgId,
                fecha: t.fecha.split('/').reverse().join('-'),
                descripcion: t.concepto,
                monto: parseFloat(t.credito || '0') - parseFloat(t.debito || '0'),
                estado: 'pendiente',
                cuenta_id: defaultAccId // Assing first account found
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
