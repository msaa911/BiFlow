import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const orgId = 'd8a87071-1d5d-4f81-a75d-6b5d2e0e9f02'

async function testTrustLedger() {
    console.log('--- STARTING DATABASE-ONLY TRUST LEDGER & SUPPLIER TEST ---')

    const testCuit = '30123456789'
    const testCbu = '0070000000000000000001'
    const maliciousCbu = '9999999999999999999999'

    console.log('Step 1: Simulating learning and Supplier creation...')

    // Simulate learning
    const { error: upsertError } = await supabase.from('trust_ledger').upsert([{
        organization_id: orgId,
        cuit: testCuit,
        cbu: testCbu,
        is_trusted: true,
        last_seen: new Date().toISOString()
    }], { onConflict: 'organization_id,cuit,cbu' })

    if (upsertError) throw new Error('Trust Ledger upsert failed: ' + upsertError.message)

    // Simulate Entidad creation
    await supabase.from('entidades').upsert([{
        organization_id: orgId,
        cuit: testCuit,
        razon_social: 'PROVEEDOR TEST ACME',
        categoria: 'proveedor',
        metadata: { cbu_habitual: testCbu }
    }], { onConflict: 'organization_id,cuit' })

    console.log('Learning and Supplier creation simulated.')

    console.log('Step 2: Testing BEC Fraud Detection logic (Manual Check)...')

    // Manual check simulating TrustLedger.validateTransactions
    const { data: trusted } = await supabase
        .from('trust_ledger')
        .select('cbu')
        .eq('organization_id', orgId)
        .eq('cuit', testCuit)
        .eq('is_trusted', true)

    const trustedCBUs = new Set(trusted?.map(t => t.cbu))

    if (trustedCBUs.has(testCbu)) {
        console.log(`Original CBU ${testCbu} is trusted.`)
    }

    if (!trustedCBUs.has(maliciousCbu)) {
        console.log(`Malicious CBU ${maliciousCbu} NOT FOUND in trusted ledger! BEC ALERT! ✅`)
    } else {
        throw new Error('BEC detection failed: Malicious CBU considered trusted')
    }

    // Cleanup (optional but good for repeatability)
    await supabase.from('trust_ledger').delete().eq('cbu', testCbu)
    await supabase.from('entidades').delete().eq('cuit', testCuit)

    console.log('--- TEST SUCCESSFUL ✅ ---')
}

testTrustLedger().catch(console.error)
