-- Migration: Reconciliation Engine v5.1 (The True Circuit - PARITY & HARDENING)
-- Date: 2026-03-30
-- Description: v5.1 restores L2 (CBU/Trust) and Regex Matching (4 digits) from v4.2.1.
-- Phases: Phase 0 (Sync) -> Phase 1 (Admin) -> Phase 2 (Banking Funnel) -> Phase 3 (Netting)

BEGIN;

-- ============================================================
-- FASE 0: SINCRONIZACIÓN DE HUÉRFANOS (Optimizado)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_phase_0_orphans(
    p_org_id UUID,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    IF NOT p_dry_run THEN
        -- Usar CTE para mejorar performance y claridad
        WITH matching_instruments AS (
            SELECT t.id as trans_id, COALESCE(SUM(ip.monto), 0) as monto_instrumentos
            FROM public.transacciones t
            JOIN public.instrumentos_pago ip ON ip.id = (t.metadata->>'instrumento_id')::uuid
            WHERE t.organization_id = p_org_id AND t.estado = 'pendiente'
            GROUP BY t.id, t.monto
            HAVING COALESCE(SUM(ip.monto), 0) >= ABS(t.monto) - 0.05
        )
        UPDATE public.transacciones t
        SET estado = 'conciliado', updated_at = NOW()
        FROM matching_instruments mi
        WHERE t.id = mi.trans_id;

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object('status', 'success', 'updated_count', v_updated_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FASE 1: CONCILIACIÓN ADMINISTRATIVA (Tesorería <-> Facturas)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_phase_1_administrative(
    p_org_id UUID,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_matched_count INT := 0; v_mov RECORD; v_match_id UUID; v_subset_ids UUID[]; v_search_types TEXT[]; v_candidate_ids UUID[]; v_candidate_amounts NUMERIC[];
BEGIN
    FOR v_mov IN SELECT mt.* FROM public.movimientos_tesoreria mt WHERE mt.organization_id = p_org_id AND (SELECT COALESCE(SUM(monto_aplicado), 0) FROM public.aplicaciones_pago WHERE movimiento_id = mt.id) < mt.monto_total - 0.01
    LOOP
        v_match_id := NULL; v_subset_ids := NULL;
        v_search_types := CASE WHEN v_mov.tipo = 'cobro' THEN ARRAY['factura_venta', 'nota_debito_venta'] ELSE ARRAY['factura_compra', 'nota_debito_compra'] END;

        -- R1: Referencia Directa
        SELECT c.id INTO v_match_id FROM public.comprobantes c WHERE c.organization_id = p_org_id AND c.entidad_id = v_mov.entidad_id AND c.estado = 'pendiente' AND c.tipo = ANY(v_search_types) AND (v_mov.concepto ~* c.nro_factura OR v_mov.observaciones ~* c.nro_factura OR (length(c.nro_factura) >= 4 AND v_mov.concepto ~* right(c.nro_factura, 5))) LIMIT 1;
        -- R2: Monto Exacto ($2.0 Tolerance)
        IF v_match_id IS NULL THEN SELECT c.id INTO v_match_id FROM public.comprobantes c WHERE c.organization_id = p_org_id AND c.entidad_id = v_mov.entidad_id AND c.estado = 'pendiente' AND c.tipo = ANY(v_search_types) AND ABS(COALESCE(c.monto_pendiente, c.monto_total) - v_mov.monto_total) <= 2.0 LIMIT 1; END IF;
        -- R3: Subset Sum
        IF v_match_id IS NULL THEN SELECT array_agg(id), array_agg(m_p) INTO v_candidate_ids, v_candidate_amounts FROM (SELECT id, COALESCE(monto_pendiente, monto_total) as m_p FROM public.comprobantes WHERE organization_id = p_org_id AND entidad_id = v_mov.entidad_id AND estado = 'pendiente' AND tipo = ANY(v_search_types) ORDER BY fecha_emision ASC LIMIT 15) sub;
            IF v_candidate_ids IS NOT NULL THEN v_subset_ids := public.fn_find_subset_sum(v_mov.monto_total, v_candidate_ids, v_candidate_amounts); END IF;
        END IF;

        IF (v_match_id IS NOT NULL OR v_subset_ids IS NOT NULL) AND NOT p_dry_run THEN
            IF v_match_id IS NOT NULL THEN INSERT INTO public.aplicaciones_pago (movimiento_id, comprobante_id, monto_aplicado) VALUES (v_mov.id, v_match_id, v_mov.monto_total); UPDATE public.comprobantes SET estado = 'pagado', monto_pendiente = 0, updated_at = NOW() WHERE id = v_match_id;
            ELSE INSERT INTO public.aplicaciones_pago (movimiento_id, comprobante_id, monto_aplicado) SELECT v_mov.id, id, COALESCE(monto_pendiente, monto_total) FROM public.comprobantes WHERE id = ANY(v_subset_ids); UPDATE public.comprobantes SET estado = 'pagado', monto_pendiente = 0, updated_at = NOW() WHERE id = ANY(v_subset_ids); END IF;
            v_matched_count := v_matched_count + 1;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('status', 'success', 'matched_count', v_matched_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FASE 2: CONCILIACIÓN BANCARIA (El Embudo L1-L4 Hardened)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_phase_2_banking(
    p_org_id UUID,
    p_cuenta_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_matched_count INT := 0; v_trans RECORD; v_match_id UUID;
BEGIN
    FOR v_trans IN SELECT t.* FROM public.transacciones t WHERE t.organization_id = p_org_id AND (p_cuenta_id IS NULL OR t.cuenta_id = p_cuenta_id) AND t.estado = 'pendiente' AND t.origen_dato != 'manual' AND ABS(t.monto) > 0.01
    LOOP
        v_match_id := NULL;

        -- L1: CUIT Exacto
        SELECT ip.id INTO v_match_id FROM public.instrumentos_pago ip JOIN public.movimientos_tesoreria mt ON ip.movimiento_id = mt.id JOIN public.entidades e ON mt.entidad_id = e.id WHERE mt.organization_id = p_org_id AND ip.estado = 'pendiente' AND ABS(ABS(ip.monto) - ABS(v_trans.monto)) <= 2.0 AND (v_trans.descripcion ~* e.cuit OR v_trans.metadata->>'cuit' = e.cuit) LIMIT 1;

        -- [NEW] L2: CBU / Trust Ledger (Matching por CBU en descripción si está vinculado a entidad)
        IF v_match_id IS NULL THEN
            SELECT ip.id INTO v_match_id FROM public.instrumentos_pago ip JOIN public.movimientos_tesoreria mt ON ip.movimiento_id = mt.id JOIN public.entidades e ON mt.entidad_id = e.id WHERE mt.organization_id = p_org_id AND ip.estado = 'pendiente' AND ABS(ABS(ip.monto) - ABS(v_trans.monto)) <= 2.0
              AND (v_trans.descripcion ~* e.cbu OR v_trans.metadata->>'cbu' = e.cbu) -- Mapeo histórico de CBU
            LIMIT 1;
        END IF;

        -- [RECOVERED] Match por 4 últimos dígitos de Referencia (v4.2.1 Parity)
        IF v_match_id IS NULL THEN
            SELECT ip.id INTO v_match_id FROM public.instrumentos_pago ip WHERE ip.movimiento_id IN (SELECT id FROM public.movimientos_tesoreria WHERE organization_id = p_org_id) AND ip.estado = 'pendiente' AND ABS(ABS(ip.monto) - ABS(v_trans.monto)) <= 2.0
              AND ip.detalle_referencia IS NOT NULL
              AND (RIGHT(REGEXP_REPLACE(ip.detalle_referencia, '[^0-9]', '', 'g'), 4) = RIGHT(REGEXP_REPLACE(v_trans.descripcion, '[^0-9]', '', 'g'), 4) AND length(REGEXP_REPLACE(ip.detalle_referencia, '[^0-9]', '', 'g')) >= 4)
            LIMIT 1;
        END IF;

        -- L3: Fuzzy Name
        IF v_match_id IS NULL THEN SELECT ip.id INTO v_match_id FROM public.instrumentos_pago ip JOIN public.movimientos_tesoreria mt ON ip.movimiento_id = mt.id JOIN public.entidades e ON mt.entidad_id = e.id WHERE mt.organization_id = p_org_id AND ip.estado = 'pendiente' AND ABS(ABS(ip.monto) - ABS(v_trans.monto)) <= 2.0 AND (v_trans.descripcion % e.razon_social OR e.razon_social % v_trans.descripcion) LIMIT 1; END IF;

        -- L4: Proximidad (Spec: 3 días)
        IF v_match_id IS NULL THEN SELECT ip.id INTO v_match_id FROM public.instrumentos_pago ip WHERE ip.movimiento_id IN (SELECT id FROM public.movimientos_tesoreria WHERE organization_id = p_org_id) AND ip.estado = 'pendiente' AND ABS(ABS(ip.monto) - ABS(v_trans.monto)) <= 2.0 AND ABS(ip.fecha_disponibilidad - v_trans.fecha) <= 3 LIMIT 1; END IF;

        IF v_match_id IS NOT NULL AND NOT p_dry_run THEN
            UPDATE public.transacciones SET estado = 'conciliado', metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('match_type', 'v5.1_circuit', 'instrumento_id', v_match_id, 'reconciled_at', NOW()) WHERE id = v_trans.id;
            UPDATE public.instrumentos_pago SET estado = 'acreditado' WHERE id = v_match_id;
            v_matched_count := v_matched_count + 1;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('status', 'success', 'matched_count', v_matched_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FASE 3: NETTING
CREATE OR REPLACE FUNCTION public.reconcile_phase_3_netting(p_org_id UUID, p_dry_run BOOLEAN DEFAULT FALSE) RETURNS JSONB AS $$
DECLARE v_res JSONB; BEGIN SELECT public.reconcile_netting_v4_0(p_org_id, p_dry_run) INTO v_res; RETURN v_res; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
