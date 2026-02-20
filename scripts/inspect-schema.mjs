import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkColumns() {
    console.log('--- INSPECTING COMPROBANTES COLUMNS ---')

    // Attempt to select one row to see columns
    const { data, error } = await supabase.from('comprobantes').select('*').limit(1)

    if (error) {
        console.error('Error selecting from comprobantes:', error)
    } else {
        console.log('Columns found in first row (keys):', data.length > 0 ? Object.keys(data[0]) : 'Table empty, trying sample insert with new columns.')

        if (data.length === 0) {
            // Try to insert a dummy row with the columns we expect
            console.log('Attempting dummy insert to verify schema...')
            const { error: insError } = await supabase.from('comprobantes').insert({
                organization_id: 'd8a87071-1d5d-4f81-a75d-6b5d2e0e9f02', // Just a placeholder
                tipo: 'factura_venta',
                cuit_socio: 'test',
                fecha_emision: '2026-02-20',
                fecha_vencimiento: '2026-02-20',
                monto_total: 0,
                monto_pendiente: 0,
                numero_cheque: 'test_verify'
            })

            if (insError) {
                console.error('Schema verification insert FAILED:', insError.message)
            } else {
                console.log('Schema verification insert SUCCESSFUL! Column exists.')
                // Cleanup
                await supabase.from('comprobantes').delete().eq('numero_cheque', 'test_verify')
            }
        }
    }
}

checkColumns()
