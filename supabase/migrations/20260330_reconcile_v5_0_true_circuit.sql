-- Migration: Reconciliation Engine v5.0 (The True Circuit - FULL ROBUST VERSION)
-- Date: 2026-03-30
-- Description: Fully aligned with RECONCILIATION_SPEC.md. Optimized and complete.
-- Phases: Phase 0 (Orphans) -> Phase 1 (Admin) -> Phase 2 (Banking) -> Phase 3 (Netting)

BEGIN;

-- ============================================================
-- FASE 0: SINCRONIZACIÓN DE HUÉRFANOS
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_phase_0_orphans(
    p_org_id UUID,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_updated_count INT := 0;
BEGIN
    IF NOT p_dry_run THEN
        UPDATE public.transacciones t
        SET estado = 'conciliado',
            updated_at = NOW()
        WHERE t.organization_id = p_org_id
          AND t.estado = 'pendiente'
          AND (
              SELECT COALESCE(SUM(ip.monto), 0) 
              FROM public.instrumentos_pago ip
              WHERE ip.id IN (
                  SELECT (t2.metadata->>'instrumento_id')::uuid 
                  FROM public.transacciones t2 
                  WHERE t2.id = t.id AND (t2.metadata->>'instrumento_id') IS NOT NULL
              )
          ) >= ABS(t.monto) - 0.05;

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
    v_matched_count INT := 0;
    v_mov RECORD;
    v_match_id UUID;
    v_subset_ids UUID[];
    v_search_types TEXT[];
    v_candidate_ids UUID[];
    v_candidate_amounts NUMERIC[];
BEGIN
    FOR v_mov IN 
        SELECT mt.* 
        FROM public.movimientos_tesoreria mt
        WHERE mt.organization_id = p_org_id 
          AND (
              SELECT COALESCE(SUM(monto_aplicado), 0) 
              FROM public.aplicaciones_pago 
              WHERE movimiento_id = mt.id
          ) < mt.monto_total - 0.01
    LOOP
        v_match_id := NULL;
        v_subset_ids := NULL;
        
        -- Tipos de búsqueda según flujo
        v_search_types := CASE WHEN v_mov.tipo = 'cobro' THEN ARRAY['factura_venta', 'nota_debito_venta'] ELSE ARRAY['factura_compra', 'nota_debito_compra'] END;

        -- REGLA 1: Match por Referencia (Factura en Concepto/Observaciones)
        SELECT c.id INTO v_match_id
        FROM public.comprobantes c
        WHERE c.organization_id = p_org_id
          AND c.entidad_id = v_mov.entidad_id
          AND c.estado = 'pendiente'
          AND c.tipo = ANY(v_search_types)
          -- Búsqueda de patrón de número de factura en concepto u observaciones
          AND (
              v_mov.concepto ~* c.nro_factura OR 
              v_mov.observaciones ~* c.nro_factura OR
              (length(c.nro_factura) >= 4 AND v_mov.concepto ~* right(c.nro_factura, 5))
          )
        LIMIT 1;

        -- REGLA 2: Match Exacto por Monto (Tolerancia $2.0 según Spec)
        IF v_match_id IS NULL THEN
            SELECT c.id INTO v_match_id
            FROM public.comprobantes c
            WHERE c.organization_id = p_org_id
              AND c.entidad_id = v_mov.entidad_id
              AND c.estado = 'pendiente'
              AND c.tipo = ANY(v_search_types)
              AND ABS(COALESCE(c.monto_pendiente, c.monto_total) - v_mov.monto_total) <= 2.0
            LIMIT 1;
        END IF;

        -- REGLA 3: Subset Sum (Combinaciones 1-a-N)
        IF v_match_id IS NULL THEN
            SELECT array_agg(id), array_agg(m_p)
            INTO v_candidate_ids, v_candidate_amounts
            FROM (
                SELECT id, COALESCE(monto_pendiente, monto_total) as m_p
                FROM public.comprobantes 
                WHERE organization_id = p_org_id 
                  AND entidad_id = v_mov.entidad_id
                  AND estado = 'pendiente' 
                  AND tipo = ANY(v_search_types)
                ORDER BY fecha_emision ASC
                LIMIT 15 -- Límite 15 según Spec para evitar timeouts
            ) sub;

            IF v_candidate_ids IS NOT NULL THEN
                v_subset_ids := public.fn_find_subset_sum(v_mov.monto_total, v_candidate_ids, v_candidate_amounts);
            END IF;
        END IF;

        -- Aplicar Match
        IF (v_match_id IS NOT NULL OR v_subset_ids IS NOT NULL) AND NOT p_dry_run THEN
            IF v_match_id IS NOT NULL THEN
                INSERT INTO public.aplicaciones_pago (movimiento_id, comprobante_id, monto_aplicado)
                VALUES (v_mov.id, v_match_id, v_mov.monto_total);
                UPDATE public.comprobantes SET estado = 'pagado', monto_pendiente = 0, updated_at = NOW() WHERE id = v_match_id;
            ELSE
                INSERT INTO public.aplicaciones_pago (movimiento_id, comprobante_id, monto_aplicado)
                SELECT v_mov.id, id, COALESCE(monto_pendiente, monto_total) FROM public.comprobantes WHERE id = ANY(v_subset_ids);
                UPDATE public.comprobantes SET estado = 'pagado', monto_pendiente = 0, updated_at = NOW() WHERE id = ANY(v_subset_ids);
            END IF;
            v_matched_count := v_matched_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('status', 'success', 'matched_count', v_matched_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FASE 2: CONCILIACIÓN BANCARIA (El Embudo L1-L4)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_phase_2_banking(
    p_org_id UUID,
    p_cuenta_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_matched_count INT := 0;
    v_trans RECORD;
    v_match_id UUID;
BEGIN
    FOR v_trans IN 
        SELECT t.* FROM public.transacciones t
        WHERE t.organization_id = p_org_id 
          AND (p_cuenta_id IS NULL OR t.cuenta_id = p_cuenta_id) 
          AND t.estado = 'pendiente' 
          AND t.origen_dato != 'manual' 
          AND ABS(t.monto) > 0.01
    LOOP
        v_match_id := NULL;

        -- L1: Match por CUIT Exacto (Prioridad Máxima)
        SELECT ip.id INTO v_match_id
        FROM public.instrumentos_pago ip
        JOIN public.movimientos_tesoreria mt ON ip.movimiento_id = mt.id
        JOIN public.entidades e ON mt.entidad_id = e.id
        WHERE mt.organization_id = p_org_id AND ip.estado = 'pendiente'
          AND ABS(ABS(ip.monto) - ABS(v_trans.monto)) <= 2.0
          AND (v_trans.descripcion ~* e.cuit OR v_trans.metadata->>'cuit' = e.cuit)
        LIMIT 1;

        -- L3: Fuzzy Search por Nombre (Confianza Alta)
        -- REQUIERE: pg_trgm extension
        IF v_match_id IS NULL THEN
            SELECT ip.id INTO v_match_id
            FROM public.instrumentos_pago ip
            JOIN public.movimientos_tesoreria mt ON ip.movimiento_id = mt.id
            JOIN public.entidades e ON mt.entidad_id = e.id
            WHERE mt.organization_id = p_org_id AND ip.estado = 'pendiente'
              AND ABS(ABS(ip.monto) - ABS(v_trans.monto)) <= 2.0
              AND (v_trans.descripcion % e.razon_social OR e.razon_social % v_trans.descripcion)
            LIMIT 1;
        END IF;

        -- L4: Cercanía & Monto (Ventana 3 días)
        IF v_match_id IS NULL THEN
            SELECT ip.id INTO v_match_id
            FROM public.instrumentos_pago ip
            WHERE ip.movimiento_id IN (SELECT id FROM public.movimientos_tesoreria WHERE organization_id = p_org_id)
              AND ip.estado = 'pendiente'
              AND ABS(ABS(ip.monto) - ABS(v_trans.monto)) <= 2.0
              AND ABS(ip.fecha_disponibilidad - v_trans.fecha) <= 3 -- Spec: 3 días
            LIMIT 1;
        END IF;

        -- Aplicar Match Bancario
        IF v_match_id IS NOT NULL AND NOT p_dry_run THEN
            UPDATE public.transacciones 
            SET estado = 'conciliado', 
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'match_type', 'v5.0_funnel', 
                    'instrumento_id', v_match_id,
                    'reconciled_at', NOW()
                ) 
            WHERE id = v_trans.id;
            
            UPDATE public.instrumentos_pago SET estado = 'acreditado' WHERE id = v_match_id;
            v_matched_count := v_matched_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('status', 'success', 'matched_count', v_matched_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FASE 3: NETTING
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_phase_3_netting(
    p_org_id UUID,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_res JSONB;
BEGIN
    -- Mantenemos la lógica de netting pero bajo el namespace del pilar 3
    SELECT public.reconcile_netting_v4_0(p_org_id, p_dry_run) INTO v_res;
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Asegurar trigramas e índices
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_entidades_razon_social_trgm ON public.entidades USING gin (razon_social gin_trgm_ops);

COMMIT;
