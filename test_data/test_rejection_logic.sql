-- SCRIPT DE PRUEBA: Lógica de Rechazo Atómico
-- Este script simula el circuito completo sin afectar datos reales.

BEGIN;

    -- 1. PREPARACIÓN: Datos de prueba
DO $$
DECLARE
    v_org_id UUID;
    v_entidad_id UUID;
    v_comprobante_id UUID;
    v_movimiento_id UUID;
    v_cheque_id UUID;
BEGIN
    -- Obtener una organización real para evitar error de FK
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró ninguna organización en la tabla public.organizations. Por favor, crea una antes de correr el test.';
    END IF;

    -- Crear Entidad (Corregido: categoria en lugar de tipo)
    INSERT INTO public.entidades (organization_id, razon_social, cuit, categoria)
    VALUES (v_org_id, 'CLIENTE TEST RECHAZO', '20-12345678-9', 'cliente')
    RETURNING id INTO v_entidad_id;

    -- Crear Factura Pendiente ($10.000)
    INSERT INTO public.comprobantes (organization_id, entidad_id, cuit_socio, razon_social_socio, tipo, nro_factura, monto_total, monto_pendiente, estado, fecha_emision, fecha_vencimiento)
    VALUES (v_org_id, v_entidad_id, '20-12345678-9', 'CLIENTE TEST RECHAZO', 'factura_venta', 'FACT-0001', 10000.00, 10000.00, 'pendiente', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days')
    RETURNING id INTO v_comprobante_id;

    -- SIMULACIÓN DE COBRO (RECIBO)
    -- Crear Movimiento de Tesorería
    INSERT INTO public.movimientos_tesoreria (organization_id, entidad_id, tipo, monto_total, concepto)
    VALUES (v_org_id, v_entidad_id, 'cobro', 10000.00, 'Cobro Factura 0001')
    RETURNING id INTO v_movimiento_id;

    -- Crear Instrumento (Cheque en Cartera)
    INSERT INTO public.instrumentos_pago (movimiento_id, metodo, monto, detalle_referencia, estado)
    VALUES (v_movimiento_id, 'cheque_terceros', 10000.00, 'CH-9999', 'pendiente')
    RETURNING id INTO v_cheque_id;

    -- Aplicar Pago (Cerrar Factura)
    INSERT INTO public.aplicaciones_pago (organization_id, movimiento_id, comprobante_id, monto_aplicado)
    VALUES (v_org_id, v_movimiento_id, v_comprobante_id, 10000.00);

    UPDATE public.comprobantes 
    SET monto_pendiente = 0, estado = 'pagado' 
    WHERE id = v_comprobante_id;

    RAISE NOTICE '--- ESCENARIO INICIAL ---';
    RAISE NOTICE 'Factura FACT-0001: Estado %, Pendiente %', (SELECT estado FROM public.comprobantes WHERE id = v_comprobante_id), (SELECT monto_pendiente FROM public.comprobantes WHERE id = v_comprobante_id);
    RAISE NOTICE 'Cheque CH-9999: Estado %', (SELECT estado FROM public.instrumentos_pago WHERE id = v_cheque_id);

    -- 2. EJECUCIÓN: Lógica de Rechazo Atómico (Lo que hará el RPC)
    RAISE NOTICE '--- EJECUTANDO RECHAZO ---';
    
    -- a) Marcar cheque como rechazado
    UPDATE public.instrumentos_pago SET estado = 'rechazado' WHERE id = v_cheque_id;

    -- b) Revertir Facturas asociadas
    -- Buscamos todas las facturas que fueron pagadas con el movimiento que originó este cheque
    UPDATE public.comprobantes c
    SET 
        monto_pendiente = c.monto_pendiente + ap.monto_aplicado,
        estado = 'pendiente'
    FROM public.aplicaciones_pago ap
    WHERE ap.comprobante_id = c.id
      AND ap.movimiento_id = v_movimiento_id;

    RAISE NOTICE '--- RESULTADO FINAL ---';
    RAISE NOTICE 'Factura FACT-0001: Estado %, Pendiente % (DEBERÍA SER PENDIENTE / 10000)', (SELECT estado FROM public.comprobantes WHERE id = v_comprobante_id), (SELECT monto_pendiente FROM public.comprobantes WHERE id = v_comprobante_id);
    RAISE NOTICE 'Cheque CH-9999: Estado % (DEBERÍA SER RECHAZADO)', (SELECT estado FROM public.instrumentos_pago WHERE id = v_cheque_id);

END $$;

ROLLBACK; -- Deshacer cambios para no ensuciar la base real
