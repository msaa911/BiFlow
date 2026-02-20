import { UniversalTranslator } from './lib/universal-translator.ts'
import { TrustLedger } from './lib/trust-ledger.ts'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const orgId = 'd8a87071-1d5d-4f81-a75d-6b5d2e0e9f02'

async function testTrustLedger() {
    console.log('--- STARTING TRUST LEDGER & SUPPLIER TEST ---')

    const rawText = `
Fecha,Concepto,Monto,CUIT,CBU
20/02/2026,PAGO PROVEEDOR ACME,-50000,30-12345678-9,0070000000000000000001
20/02/2026,PAGO PROVEEDOR OTRO,-25000,30-98765432-1,0070000000000000000002
    `

    console.log('Step 1: Testing UniversalTranslator CBU extraction...')
    const result = UniversalTranslator.translate(rawText)
    const t1 = result.transactions[0]
    console.log(`Extracted CBU 1: ${t1.cbu} (Length: ${t1.cbu?.length})`)

    if (t1.cbu !== '0070000000000000000001') {
        throw new Error('CBU extraction failed')
    }

    console.log('Step 2: Testing TrustLedger learning and Supplier creation...')
    // Mock the database structure as expected by TrustLedger.learn
    const processedTxs = result.transactions.map(t => ({
        cuit: t.cuit?.replace(/-/g, ''),
        razon_social: t.concepto,
        metadata: { cbu: t.cbu }
    }))

    await TrustLedger.learn(processedTxs, orgId)
    console.log('Learning completed.')

    const { data: entity } = await supabase
        .from('entidades')
        .select('*')
        .eq('organization_id', orgId)
        .eq('cuit', '30123456789')
        .single()

    if (entity && entity.categoria === 'proveedor') {
        console.log(`Supplier successfully created: ${entity.razon_social}`)
    } else {
        throw new Error('Supplier creation failed')
    }

    console.log('Step 3: Testing BEC Fraud Detection (CBU Change)...')
    const maliciousTx = {
        db_id: 'fake-id',
        cuit: '30123456789',
        metadata: { cbu: '9999999999999999999999' } // Different CBU!
    }

    const alerts = await TrustLedger.validateTransactions([maliciousTx], orgId)
    if (alerts.length > 0 && alerts[0].severidad === 'critical') {
        console.log('BEC ALERT DETECTED! ✅')
        console.log('Detail:', alerts[0].detalle.razon)
    } else {
        throw new Error('BEC detection failed')
    }

    console.log('--- TEST SUCCESSFUL ✅ ---')
}

testTrustLedger().catch(console.error)
