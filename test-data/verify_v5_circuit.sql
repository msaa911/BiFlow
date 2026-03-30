-- SCRIPT DE VERIFICACIÓN INTEGRAL v5.1 (VERSIÓN ENDURADA - RELATIONAL INTEGRITY)
-- Valida las 4 fases del "True Circuit" respetando la integridad referencial.

BEGIN;

DO $$
DECLARE
    v_org_id UUID; v_entidad_id UUID; v_cuentab_id UUID;
    v_factura_id UUID; v_mov_id UUID; v_inst_id UUID; v_trans_id UUID;
    v_res JSONB;
BEGIN
    -- 1. SETUP: Identificar Organización
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'No hay organización.'; END IF;

    -- Crear Entidad con CUIT y CBU
    INSERT INTO public.entidades (organization_id, razon_social, cuit, cbu, categoria)
    VALUES (v_org_id, 'IMPORTADORA TEST S.A.', '30-77777777-9', '0070001234567890123456', 'proveedor')
    RETURNING id INTO v_entidad_id;

    -- Crear Cuenta Bancaria
    INSERT INTO public.cuentas_bancarias (organization_id, banco_nombre, cbu, moneda)
    VALUES (v_org_id, 'Banco Galicia Test', '0070001234567890123456', 'ARS')
    RETURNING id INTO v_cuentab_id;

    RAISE NOTICE '--- TEST FASE 0: HUÉRFANOS (RELATIONAL) ---';
    -- Paso A: Crear Movimiento Padre
    INSERT INTO public.movimientos_tesoreria (organization_id, entidad_id, tipo, monto_total, concepto)
    VALUES (v_org_id, v_entidad_id, 'cobro', 5000.00, 'Movimiento para Huérfano')
    RETURNING id INTO v_mov_id;

    -- Paso B: Crear Instrumento Hijo Real
    INSERT INTO public.instrumentos_pago (movimiento_id, metodo, monto, estado)
    VALUES (v_mov_id, 'transferencia', 5000.00, 'pendiente')
    RETURNING id INTO v_inst_id;

    -- Paso C: Crear Transacción Bancaria Vinculada (pero en estado pendiente)
    INSERT INTO public.transacciones (organization_id, cuenta_id, fecha, descripcion, monto, estado, metadata, origen_dato)
    VALUES (v_org_id, v_cuentab_id, CURRENT_DATE, 'Transferencia Recibida 001', 5000.00, 'pendiente', 
            jsonb_build_object('instrumento_id', v_inst_id), 'banco')
    RETURNING id INTO v_trans_id;

    SELECT public.reconcile_phase_0_orphans(v_org_id) INTO v_res;
    RAISE NOTICE 'Fase 0 Res: %', v_res;
    IF (SELECT estado FROM public.transacciones WHERE id = v_trans_id) != 'conciliado' THEN
        RAISE EXCEPTION 'Fase 0 falló: Transacción no conciliada';
    END IF;

    RAISE NOTICE '--- TEST FASE 1: ADMINISTRATIVA (REF + MONTO) ---';
    -- Escenario: Match por Referencia (4 últimos dígitos nro_factura)
    INSERT INTO public.comprobantes (organization_id, entidad_id, tipo, nro_factura, monto_total, monto_pendiente, estado, fecha_emision, fecha_vencimiento)
    VALUES (v_org_id, v_entidad_id, 'factura_compra', '0001-00008888', 1200.00, 1200.00, 'pendiente', CURRENT_DATE, CURRENT_DATE)
    RETURNING id INTO v_factura_id;

    INSERT INTO public.movimientos_tesoreria (organization_id, entidad_id, tipo, monto_total, concepto)
    VALUES (v_org_id, v_entidad_id, 'pago', 1200.00, 'Pago Fac 8888')
    RETURNING id INTO v_mov_id;

    SELECT public.reconcile_phase_1_administrative(v_org_id) INTO v_res;
    RAISE NOTICE 'Fase 1 Res: %', v_res;
    IF (SELECT estado FROM public.comprobantes WHERE id = v_factura_id) != 'pagado' THEN
        RAISE EXCEPTION 'Fase 1 Match falló';
    END IF;

    RAISE NOTICE '--- TEST FASE 2: BANCARIA (EMBUDO L1-L4) ---';
    -- Escenario: Match L1 (CUIT)
    INSERT INTO public.movimientos_tesoreria (organization_id, entidad_id, tipo, monto_total, concepto)
    VALUES (v_org_id, v_entidad_id, 'cobro', 1500.00, 'Cobro a Importadora')
    RETURNING id INTO v_mov_id;

    INSERT INTO public.instrumentos_pago (movimiento_id, metodo, monto, estado)
    VALUES (v_mov_id, 'transferencia', 1500.00, 'pendiente')
    RETURNING id INTO v_inst_id;

    INSERT INTO public.transacciones (organization_id, cuenta_id, fecha, descripcion, monto, estado, metadata, origen_dato)
    VALUES (v_org_id, v_cuentab_id, CURRENT_DATE, 'TRANSF 30777777779 IMPORTADORA', 1500.00, 'pendiente', '{}'::jsonb, 'banco')
    RETURNING id INTO v_trans_id;

    SELECT public.reconcile_phase_2_banking(v_org_id) INTO v_res;
    RAISE NOTICE 'Fase 2 CUIT Res: %', v_res;
    IF (SELECT estado FROM public.transacciones WHERE id = v_trans_id) != 'conciliado' THEN
        RAISE EXCEPTION 'Fase 2 L1 CUIT falló';
    END IF;

    -- Escenario: Match L2 (CBU/Trust)
    INSERT INTO public.movimientos_tesoreria (organization_id, entidad_id, tipo, monto_total, concepto)
    VALUES (v_org_id, v_entidad_id, 'pago', 2500.00, 'Pago CBU')
    RETURNING id INTO v_mov_id;

    INSERT INTO public.instrumentos_pago (movimiento_id, metodo, monto, estado)
    VALUES (v_mov_id, 'transferencia', 2500.00, 'pendiente')
    RETURNING id INTO v_inst_id;

    INSERT INTO public.transacciones (organization_id, cuenta_id, fecha, descripcion, monto, estado, metadata, origen_dato)
    VALUES (v_org_id, v_cuentab_id, CURRENT_DATE, 'DEBITO AL CBU 0070001234567890123456', -2500.00, 'pendiente', '{}'::jsonb, 'banco')
    RETURNING id INTO v_trans_id;

    SELECT public.reconcile_phase_2_banking(v_org_id) INTO v_res;
    RAISE NOTICE 'Fase 2 CBU Res: %', v_res;
    IF (SELECT estado FROM public.transacciones WHERE id = v_trans_id) != 'conciliado' THEN
        RAISE EXCEPTION 'Fase 2 L2 CBU falló';
    END IF;

    RAISE NOTICE '--- TEST TOLERANCIA ($2.0) ---';
    INSERT INTO public.movimientos_tesoreria (organization_id, entidad_id, tipo, monto_total, concepto)
    VALUES (v_org_id, v_entidad_id, 'pago', 3000.00, 'Pago Tolerancia')
    RETURNING id INTO v_mov_id;

    INSERT INTO public.instrumentos_pago (movimiento_id, metodo, monto, estado)
    VALUES (v_mov_id, 'transferencia', 3000.00, 'pendiente')
    RETURNING id INTO v_inst_id;

    INSERT INTO public.transacciones (organization_id, cuenta_id, fecha, descripcion, monto, estado, metadata, origen_dato)
    VALUES (v_org_id, v_cuentab_id, CURRENT_DATE, 'DEBITO TOLERANCIA', -3001.99, 'pendiente', '{}'::jsonb, 'banco')
    RETURNING id INTO v_trans_id;

    SELECT public.reconcile_phase_2_banking(v_org_id) INTO v_res;
    RAISE NOTICE 'Fase 2 Tolerancia Res: %', v_res;
    IF (SELECT estado FROM public.transacciones WHERE id = v_trans_id) != 'conciliado' THEN
        RAISE EXCEPTION 'Test Tolerancia $1.99 falló';
    END IF;

    RAISE NOTICE '--- AUDITORÍA FINALIZADA EXITOSAMENTE ---';
END $$;

ROLLBACK;
