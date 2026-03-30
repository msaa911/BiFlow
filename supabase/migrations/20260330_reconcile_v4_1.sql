-- Migration: Upgrade Reconciliation Engine to v4.1 (Full Cycle & Netting)
-- Date: 2026-03-30
-- Description: Supports bidirectional reconciliation (Sales/Purchases) and automated netting.

BEGIN;

-- 1. Updated Engine v4.0 (becoming v4.1 logic)
-- Changes: handles negative transactions (debits) and matches against purchases.
CREATE OR REPLACE FUNCTION public.reconcile_v4_0(
    p_org_id UUID,
    p_cuenta_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_matched_count INT := 0;
    v_total_read INT := 0;
    v_trans RECORD;
    v_match_id UUID;
    v_subset_ids UUID[];
    v_metadata JSONB;
    v_candidate_ids UUID[];
    v_candidate_amounts NUMERIC[];
    v_search_types TEXT[];
BEGIN
    -- Iterar sobre transacciones bancarias pendientes (Independiente del signo)
    FOR v_trans IN 
        SELECT t.* 
        FROM public.transacciones t
        WHERE t.organization_id = p_org_id 
          AND (p_cuenta_id IS NULL OR t.cuenta_id = p_cuenta_id)
          AND t.estado = 'pendiente'
          AND abs(t.monto) > 0.01
    LOOP
        v_total_read := v_total_read + 1;
        v_match_id := NULL;
        v_subset_ids := NULL;
        v_metadata := '{}'::jsonb;

        -- Definir tipos de búsqueda según signo
        -- Positivo (Crédito) -> Buscar en Facturas de Venta
        -- Negativo (Débito) -> Buscar en Facturas de Compra
        IF v_trans.monto > 0 THEN
            v_search_types := ARRAY['factura_venta', 'nota_debito_venta'];
        ELSE
            v_search_types := ARRAY['factura_compra', 'nota_debito_compra'];
        END IF;

        -- L1: Fuzzy Search Nativo (Concepto + Monto Exacto)
        SELECT c.id INTO v_match_id
        FROM public.comprobantes c
        WHERE c.organization_id = p_org_id
          AND c.estado = 'pendiente'
          AND c.tipo = ANY(v_search_types)
          AND (c.concepto % v_trans.descripcion OR similarity(c.concepto, v_trans.descripcion) > 0.4)
          AND ABS(ABS(COALESCE(c.monto_pendiente, c.monto_total)) - ABS(v_trans.monto)) < 0.05
        ORDER BY similarity(c.concepto, v_trans.descripcion) DESC
        LIMIT 1;

        IF v_match_id IS NOT NULL THEN
            v_metadata := v_metadata || '{"match_method": "fuzzy_search_gin_v4.1"}';
        END IF;

        -- L2: Subset Sum (Match 1:N)
        IF v_match_id IS NULL THEN
            -- Recolectar candidatos (facturas pendientes del tipo correspondiente)
            SELECT array_agg(id), array_agg(monto_val)
            INTO v_candidate_ids, v_candidate_amounts
            FROM (
                SELECT id, ABS(COALESCE(monto_pendiente, monto_total)) as monto_val
                FROM public.comprobantes 
                WHERE organization_id = p_org_id 
                  AND estado = 'pendiente' 
                  AND tipo = ANY(v_search_types)
                ORDER BY fecha_emision DESC
                LIMIT 50
            ) sub;

            IF v_candidate_ids IS NOT NULL THEN
                v_subset_ids := public.fn_find_subset_sum(ABS(v_trans.monto), v_candidate_ids, v_candidate_amounts);
            END IF;

            IF v_subset_ids IS NOT NULL THEN
                v_metadata := v_metadata || jsonb_build_object(
                    'match_method', 'subset_sum_n50_v4.1',
                    'matched_invoices', v_subset_ids
                );
            END IF;
        END IF;

        -- Aplicar Match
        IF (v_match_id IS NOT NULL OR v_subset_ids IS NOT NULL) AND NOT p_dry_run THEN
            -- Marcar transacción bancaria
            PERFORM public.safe_update_transaction(
                v_trans.id, 
                'conciliado', 
                NULL, 
                v_metadata
            );

            -- Marcar comprobantes vinculados (Subset Sum)
            IF v_subset_ids IS NOT NULL THEN
                UPDATE public.comprobantes 
                SET estado = 'pagado', 
                    monto_pendiente = 0,
                    updated_at = NOW()
                WHERE id = ANY(v_subset_ids);
            END IF;

            -- Marcar comprobante único (Fuzzy)
            IF v_match_id IS NOT NULL THEN
                UPDATE public.comprobantes 
                SET estado = 'pagado', 
                    monto_pendiente = 0,
                    updated_at = NOW()
                WHERE id = v_match_id;
            END IF;

            v_matched_count := v_matched_count + 1;
        END IF;

    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'matched_count', v_matched_count,
        'total_read', v_total_read,
        'version', '4.1'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Nueva Función: Netting Inteligente Automático
CREATE OR REPLACE FUNCTION public.reconcile_netting_v4_0(
    p_org_id UUID,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_netting_count INT := 0;
    v_total_compensated NUMERIC := 0;
    v_entity RECORD;
    v_min_monto NUMERIC;
    v_v_ids UUID[];
    v_c_ids UUID[];
BEGIN
    -- Identificar entidades con saldos en ambos lados
    FOR v_entity IN 
        SELECT 
            c.entidad_id,
            SUM(CASE WHEN c.tipo IN ('factura_venta', 'nota_debito_venta') THEN COALESCE(c.monto_pendiente, c.monto_total) ELSE 0 END) as saldo_v,
            SUM(CASE WHEN c.tipo IN ('factura_compra', 'nota_debito_compra') THEN COALESCE(c.monto_pendiente, c.monto_total) ELSE 0 END) as saldo_c
        FROM public.comprobantes c
        WHERE c.organization_id = p_org_id 
          AND c.estado = 'pendiente'
          AND c.entidad_id IS NOT NULL
        GROUP BY c.entidad_id
        HAVING SUM(CASE WHEN c.tipo IN ('factura_venta', 'nota_debito_venta') THEN 1 ELSE 0 END) > 0
           AND SUM(CASE WHEN c.tipo IN ('factura_compra', 'nota_debito_compra') THEN 1 ELSE 0 END) > 0
    LOOP
        -- Calcular monto a compensar (el menor de ambos saldos)
        v_min_monto := LEAST(v_entity.saldo_v, v_entity.saldo_c);
        
        IF v_min_monto > 0.01 THEN
            v_netting_count := v_netting_count + 1;
            v_total_compensated := v_total_compensated + v_min_monto;

            IF NOT p_dry_run THEN
                -- 1. Compensar Ventas (FIFO por fecha)
                WITH ventas_a_pagar AS (
                    SELECT id, COALESCE(monto_pendiente, monto_total) as m_p
                    FROM public.comprobantes
                    WHERE entidad_id = v_entity.entidad_id 
                      AND tipo IN ('factura_venta', 'nota_debito_venta')
                      AND estado = 'pendiente'
                    ORDER BY fecha_emision ASC
                )
                UPDATE public.comprobantes c
                SET 
                    monto_pendiente = GREATEST(0, m.m_p - v_min_monto),
                    estado = CASE WHEN m.m_p <= v_min_monto THEN 'pagado' ELSE 'pendiente' END,
                    updated_at = NOW()
                FROM ventas_a_pagar m
                WHERE c.id = m.id;

                -- 2. Compensar Compras (FIFO por fecha)
                WITH compras_a_pagar AS (
                    SELECT id, COALESCE(monto_pendiente, monto_total) as m_p
                    FROM public.comprobantes
                    WHERE entidad_id = v_entity.entidad_id 
                      AND tipo IN ('factura_compra', 'nota_debito_compra')
                      AND estado = 'pendiente'
                    ORDER BY fecha_emision ASC
                )
                UPDATE public.comprobantes c
                SET 
                    monto_pendiente = GREATEST(0, m.m_p - v_min_monto),
                    estado = CASE WHEN m.m_p <= v_min_monto THEN 'pagado' ELSE 'pendiente' END,
                    updated_at = NOW()
                FROM compras_a_pagar m
                WHERE c.id = m.id;
                
                -- TODO: En una versión futura, generar Movimientos de Tesorería de tipo 'netting' 
                -- para auditoría contable. Por ahora solo limpiamos estados.
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'netting_count', v_netting_count,
        'total_compensated', v_total_compensated
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
