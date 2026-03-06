import { createClient } from '../lib/supabase/client'

async function testQuery() {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('movimientos_tesoreria')
        .select(`
            *,
            entidades (razon_social),
            instrumentos_pago (*),
            transacciones (*),
            aplicaciones_pago (
                monto_aplicado,
                comprobante_id,
                comprobantes (nro_factura, tipo)
            )
        `)
        .limit(1)

    if (error) {
        console.error('ERROR DETECTADO:', error)
    } else {
        console.log('CONSULTA EXITOSA:', data)
    }
}

testQuery()
