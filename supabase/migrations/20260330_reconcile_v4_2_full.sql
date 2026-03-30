-- Migration: Consolidated Reconciliation Engine v4.2 (Full Circuit)
-- Date: 2026-03-30
-- Description: 3-Pillar Engine: Banking (Bank-Treasury), Commercial (Treasury-Invoice), and Netting (Invoice-Invoice).

BEGIN;

-- ============================================================
-- Pilar 1: CONCILIACIÓN BANCARIA (Banco <-> Tesorería)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_banking_v4_2(
    p_org_id UUID,
    p_cuenta_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_matched_count INT := 0;
    v_trans RECORD;
    v_match_id UUID; -- ID del instrumento de pago
BEGIN
    FOR v_trans IN 
        SELECT t.* 
        FROM public.transacciones t
        WHERE t.organization_id = p_org_id 
          AND (p_cuenta_id IS NULL OR t.cuenta_id = p_cuenta_id)
          AND t.estado = 'pendiente'
          AND t.origen_dato != 'manual' -- Solo extractos (Interbanking/CSV)
          AND abs(t.monto) > 0.01
    LOOP
        v_match_id := NULL;

        -- L1: Match por Monto Exacto + Ventana 10 días + Referencia (últimos 4 dígitos)
        SELECT ip.id INTO v_match_id
        FROM public.instrumentos_pago ip
        WHERE ip.movimiento_id IN (SELECT id FROM public.movimientos_tesoreria WHERE organization_id = p_org_id)
          AND ip.estado = 'pendiente'
          AND ABS(ABS(ip.monto) - ABS(v_trans.monto)) < 0.05
          AND ABS(ip.fecha_disponibilidad - v_trans.fecha) <= 10
          -- Matching de referencia (si existe en ambos)
          AND (
            (ip.referencia IS NOT NULL AND v_trans.descripcion ~* ip.referencia) OR
            (RIGHT(REGEXP_REPLACE(ip.referencia, '[^0-9]', '', 'g'), 4) = RIGHT(REGEXP_REPLACE(v_trans.descripcion, '[^0-9]', '', 'g'), 4) AND length(REGEXP_REPLACE(ip.referencia, '[^0-9]', '', 'g')) >= 4)
          )
        LIMIT 1;

        -- L2: Match por Monto Exacto + Ventana 5 días (Si no hay ambigüedad)
        IF v_match_id IS NULL THEN
            SELECT ip.id INTO v_match_id
            FROM public.instrumentos_pago ip
            WHERE ip.movimiento_id IN (SELECT id FROM public.movimientos_tesoreria WHERE organization_id = p_org_id)
              AND ip.estado = 'pendiente'
              AND ABS(ABS(ip.monto) - ABS(v_trans.monto)) < 0.01
              AND ABS(ip.fecha_disponibilidad - v_trans.fecha) <= 5
              AND (
                  SELECT COUNT(*) 
                  FROM public.instrumentos_pago ip2 
                  WHERE ip2.movimiento_id IN (SELECT id FROM public.movimientos_tesoreria WHERE organization_id = p_org_id)
                    AND ip2.estado = 'pendiente'
                    AND ABS(ABS(ip2.monto) - ABS(v_trans.monto)) < 0.01
                    AND ABS(ip2.fecha_disponibilidad - v_trans.fecha) <= 5
              ) = 1
            LIMIT 1;
        END IF;

        -- Aplicar Match Bancario
        IF v_match_id IS NOT NULL AND NOT p_dry_run THEN
            -- 1. Marcar transacción bancaria del extracto
            UPDATE public.transacciones 
            SET estado = 'conciliado',
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'match_type', 'banking_v4.2',
                    'instrumento_id', v_match_id,
                    'reconciled_at', NOW()
                )
            WHERE id = v_trans.id;

            -- 2. Marcar instrumento de pago como acreditado
            UPDATE public.instrumentos_pago
            SET estado = 'acreditado'
            WHERE id = v_match_id;

            v_matched_count := v_matched_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'matched_count', v_matched_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Pilar 2: CONCILIACIÓN COMERCIAL (Tesorería <-> Facturas)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_commercial_v4_2(
    p_org_id UUID,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_matched_count INT := 0;
    v_mov RECORD;
    v_match_id UUID;
    v_subset_ids UUID[];
    v_metadata JSONB;
    v_candidate_ids UUID[];
    v_candidate_amounts NUMERIC[];
    v_search_types TEXT[];
BEGIN
    -- Iterar sobre movimientos de tesorería (Recibos/OP) que aún no tienen aplicaciones
    -- o cuyo monto_total no ha sido totalmente aplicado.
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
        v_metadata := '{}'::jsonb;

        -- Definir tipos de facturas según tipo de movimiento
        IF v_mov.tipo = 'cobro' THEN
            v_search_types := ARRAY['factura_venta', 'nota_debito_venta'];
        ELSE
            v_search_types := ARRAY['factura_compra', 'nota_debito_compra'];
        END IF;

        -- L1: Match Exacto por Entidad + Monto
        SELECT c.id INTO v_match_id
        FROM public.comprobantes c
        WHERE c.organization_id = p_org_id
          AND c.entidad_id = v_mov.entidad_id
          AND c.estado = 'pendiente'
          AND c.tipo = ANY(v_search_types)
          AND ABS(COALESCE(c.monto_pendiente, c.monto_total) - v_mov.monto_total) < 0.05
        LIMIT 1;

        -- L2: Subset Sum (1 Movimiento paga N facturas de la misma entidad)
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
                LIMIT 20
            ) sub;

            IF v_candidate_ids IS NOT NULL THEN
                v_subset_ids := public.fn_find_subset_sum(v_mov.monto_total, v_candidate_ids, v_candidate_amounts);
            END IF;
        END IF;

        -- Aplicar Match Comercial
        IF (v_match_id IS NOT NULL OR v_subset_ids IS NOT NULL) AND NOT p_dry_run THEN
            -- 1. Crear Aplicación de Pago
            IF v_match_id IS NOT NULL THEN
                INSERT INTO public.aplicaciones_pago (movimiento_id, comprobante_id, monto_aplicado)
                VALUES (v_mov.id, v_match_id, v_mov.monto_total);

                UPDATE public.comprobantes 
                Set estado = 'pagado', monto_pendiente = 0, updated_at = NOW()
                WHERE id = v_match_id;
            ELSE
                -- Manejar Subset Sum: Marcar facturas como pagadas y crear aplicaciones
                INSERT INTO public.aplicaciones_pago (movimiento_id, comprobante_id, monto_aplicado)
                SELECT v_mov.id, id, COALESCE(monto_pendiente, monto_total)
                FROM public.comprobantes
                WHERE id = ANY(v_subset_ids);

                UPDATE public.comprobantes 
                SET estado = 'pagado', monto_pendiente = 0, updated_at = NOW()
                WHERE id = ANY(v_subset_ids);
            END IF;

            v_matched_count := v_matched_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'matched_count', v_matched_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Pilar 3: NETTING (Factura <-> Factura)
-- ============================================================
-- Mantenemos la lógica de reconcile_netting_v4_0 pero la renombramos por consistencia
CREATE OR REPLACE FUNCTION public.reconcile_netting_v4_2(
    p_org_id UUID,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
BEGIN
    RETURN public.reconcile_netting_v4_0(p_org_id, p_dry_run);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
