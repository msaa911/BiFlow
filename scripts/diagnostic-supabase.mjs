const SUPABASE_URL = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';
const ORG_ID = '01886884-3cda-4700-983e-105151f15151'; // Attempt to guess or use a dummy if not found

async function testInsert() {
    console.log('Testing direct insert into "comprobantes"...');

    const payload = {
        organization_id: 'e6966138-081e-4509-9061-68be434a946e', // Use valid org from logs if possible
        tipo: 'factura_venta',
        numero: 'TEST-0001',
        cuit_socio: '20123456789',
        razon_social_socio: 'TEST SOCIO',
        fecha_emision: '2026-02-23',
        fecha_vencimiento: '2026-02-23',
        monto_total: 100.00,
        monto_pendiente: 100.00,
        estado: 'pendiente',
        condicion: 'cuenta_corriente',
        moneda: 'ARS'
    };

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/comprobantes`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('FAILED:', data);
        } else {
            console.log('SUCCESS:', data);
        }
    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    }
}

testInsert();
