import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testBatchReconciliation() {
    console.log('--- STARTING BATCH RECONCILIATION TEST ---')

    const { data: orgs } = await supabase.from('organizations').select('id').limit(1)
    const orgId = orgs[0]?.id
    if (!orgId) return console.error('No org found')

    const testId = Math.random().toString(36).substring(7)
    const amount1 = 1000
    const amount2 = 500
    const totalAmount = 1500

    // 1. Create 2 Invoices
    console.log('1. Creating 2 invoices...')
    const today = new Date().toISOString().split('T')[0]
    const { data: inv1, error: e1 } = await supabase.from('comprobantes').insert({
        organization_id: orgId, tipo: 'factura_venta', numero: `INV1-${testId}`,
        monto_total: amount1, monto_pendiente: amount1, estado: 'pendiente',
        cuit_socio: '20-11111111-2', razon_social_socio: 'Test Socio',
        fecha_emision: today, fecha_vencimiento: today
    }).select().single()
    if (e1) throw new Error(`Invoice 1 fail: ${e1.message}`)

    const { data: inv2, error: e2 } = await supabase.from('comprobantes').insert({
        organization_id: orgId, tipo: 'factura_venta', numero: `INV2-${testId}`,
        monto_total: amount2, monto_pendiente: amount2, estado: 'pendiente',
        cuit_socio: '20-11111111-2', razon_social_socio: 'Test Socio',
        fecha_emision: today, fecha_vencimiento: today
    }).select().single()
    if (e2) throw new Error(`Invoice 2 fail: ${e2.message}`)

    // 2. Create 2 Receipts (Movements)
    console.log('2. Creating 2 receipts...')
    const { data: mov1, error: e3 } = await supabase.from('movimientos_tesoreria').insert({
        organization_id: orgId, tipo: 'cobro', monto_total: amount1, numero: `REC1-${testId}`
    }).select().single()
    if (e3) throw new Error(`Mov 1 fail: ${e3.message}`)

    const { data: mov2, error: e4 } = await supabase.from('movimientos_tesoreria').insert({
        organization_id: orgId, tipo: 'cobro', monto_total: amount2, numero: `REC2-${testId}`
    }).select().single()
    if (e4) throw new Error(`Mov 2 fail: ${e4.message}`)

    // 3. Create Applications
    await supabase.from('aplicaciones_pago').insert([
        { movimiento_id: mov1.id, comprobante_id: inv1.id, monto_aplicado: amount1 },
        { movimiento_id: mov2.id, comprobante_id: inv2.id, monto_aplicado: amount2 }
    ])

    // 4. Create Instruments (Pending)
    await supabase.from('instrumentos_pago').insert([
        { movimiento_id: mov1.id, metodo: 'transferencia', monto: amount1, estado: 'pendiente' },
        { movimiento_id: mov2.id, metodo: 'transferencia', monto: amount2, estado: 'pendiente' }
    ])

    // 5. Create Bank Transaction
    console.log('3. Creating Bank Transaction...')
    const { data: tx, error: e5 } = await supabase.from('transacciones').insert({
        organization_id: orgId, fecha: new Date().toISOString(),
        descripcion: `DEPOSITO LOTE ${testId}`, monto: totalAmount, estado: 'pendiente',
        origen_dato: 'test_script', moneda: 'ARS'
    }).select().single()
    if (e5) throw new Error(`TX fail: ${e5.message}`)

    // 6. Simulate Batch Linking (What handleConciliate does)
    console.log('4. Simulating Batch Linking...')
    const movementIds = [mov1.id, mov2.id]

    // Link TX
    await supabase.from('transacciones').update({
        movimiento_id: movementIds[0],
        estado: 'conciliado',
        monto_usado: totalAmount,
        metadata: { batch_test: true, all_movement_ids: movementIds }
    }).eq('id', tx.id)

    // Update Instruments
    await supabase.from('instrumentos_pago').update({ estado: 'acreditado' }).in('movimiento_id', movementIds)

    // Propagate state to Invoices
    const { data: apps } = await supabase.from('aplicaciones_pago').select('comprobante_id').in('movimiento_id', movementIds)
    const invoiceIds = apps.map(a => a.comprobante_id)
    await supabase.from('comprobantes').update({ estado: 'conciliado' }).in('id', invoiceIds)

    // 7. Verification
    console.log('5. Verifying results...')
    const { data: verifTx } = await supabase.from('transacciones').select('estado').eq('id', tx.id).single()
    const { data: verifInvs } = await supabase.from('comprobantes').select('estado').in('id', invoiceIds)
    const { data: verifIns } = await supabase.from('instrumentos_pago').select('estado').in('movimiento_id', movementIds)

    console.log('Tx Status:', verifTx.estado)
    console.log('Invoices Status:', verifInvs.map(i => i.estado))
    console.log('Instruments Status:', verifIns.map(i => i.estado))

    if (verifTx.estado === 'conciliado' && verifInvs.every(i => i.estado === 'conciliado') && verifIns.every(i => i.estado === 'acreditado')) {
        console.log('--- BATCH TEST SUCCESSFUL ✅ ---')
    } else {
        console.error('--- BATCH TEST FAILED ❌ ---')
    }
}

testBatchReconciliation()
