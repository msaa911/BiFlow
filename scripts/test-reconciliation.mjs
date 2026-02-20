import { createClient } from '@supabase/supabase-js'

// Fully self-contained test script for reconciliation logic verification
const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testReconciliation() {
    console.log('--- STARTING SELF-CONTAINED RECONCILIATION TEST ---')

    const { data: orgs } = await supabase.from('organizations').select('id').limit(1)
    const orgId = orgs[0]?.id

    if (!orgId) {
        console.error('No organization found.')
        return
    }

    const testId = Math.random().toString(36).substring(7)
    const testCheckNumber = `CHQ-${Math.floor(100000 + Math.random() * 900000)}`
    const testAmount = 2500.50
    const testCuit = '20-88888888-8'

    console.log(`Testing with Check: ${testCheckNumber} (Last4: ${testCheckNumber.slice(-4)}), Amount: ${testAmount}`)

    // 1. Insert Pending Invoice
    console.log('Step 1: Inserting pending invoice...')
    const { data: invoice, error: invErr } = await supabase
        .from('comprobantes')
        .insert({
            organization_id: orgId,
            tipo: 'factura_venta',
            numero: `INV-T-${testId}`,
            cuit_socio: testCuit,
            numero_cheque: testCheckNumber,
            fecha_emision: new Date().toISOString().split('T')[0],
            fecha_vencimiento: new Date().toISOString().split('T')[0],
            monto_total: testAmount,
            monto_pendiente: testAmount,
            estado: 'pendiente'
        })
        .select()
        .single()

    if (invErr) {
        console.error('Error creating invoice:', invErr)
        return
    }

    // 2. Insert Matching Bank Transaction
    console.log('Step 2: Inserting matching bank transaction...')
    const { data: trans, error: transErr } = await supabase
        .from('transacciones')
        .insert({
            organization_id: orgId,
            fecha: new Date().toISOString().split('T')[0],
            descripcion: `PAGO TEST ${testId}`,
            monto: testAmount,
            numero_cheque: testCheckNumber,
            estado: 'pendiente',
            origen_dato: 'test_script'
        })
        .select()
        .single()

    if (transErr) {
        console.error('Error creating transaction:', transErr)
        return
    }

    // 3. Simulated Engine Logic
    console.log('Step 3: Finding match using engine logic...')
    const last4 = testCheckNumber.slice(-4)
    const { data: matches } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .is('comprobante_id', null)
        .eq('monto', testAmount)
        .ilike('numero_cheque', `%${last4}`)

    if (matches && matches.some(m => m.id === trans.id)) {
        console.log('Match FOUND by logic.')
        await supabase.from('transacciones').update({ comprobante_id: invoice.id }).eq('id', trans.id)
        await supabase.from('comprobantes').update({ estado: 'pagado', monto_pendiente: 0 }).eq('id', invoice.id)
        console.log('Records updated.')
    } else {
        console.error('Match NOT FOUND.')
    }

    // 4. Confirmation
    const { data: finalInv } = await supabase.from('comprobantes').select('estado').eq('id', invoice.id).single()
    console.log(`Result: Invoice status is "${finalInv.estado}"`)

    if (finalInv.estado === 'pagado') {
        console.log('--- TEST SUCCESSFUL ✅ ---')
    } else {
        console.log('--- TEST FAILED ❌ ---')
    }
}

testReconciliation()
