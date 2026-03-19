-- Advanced Bank Reconciliation Engine v5.2.6 (THE TOTAL DIAGNOSTIC EDITION)
-- Author: Antigravity AI
-- Date: 2026-03-19
-- Features: Dynamic Labels, Ambiguity Detection, Global Diagnostics, Full Levels

CREATE OR REPLACE FUNCTION public.reconcile_v3_1(
    p_org_id UUID,
    p_cuenta_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_matched_count INT := 0;
    v_total_read INT := 0;
    v_admin_matched INT := 0;
    v_trans RECORD;
    v_mov RECORD;
    v_inv_match RECORD;
    v_match_id UUID; 
    v_match_level INT;
    v_match_label TEXT;
    v_matches JSONB := '[]'::jsonb;
    v_suggestions JSONB;
    v_extracted_cuit TEXT;
    v_result JSONB;
    v_fail_reason TEXT;
    v_candidates_count INT;
BEGIN
    RAISE NOTICE 'Iniciando Reconciliación V5.2.6 para Org: % (Escaneo Completo)', p_org_id;

    -- ============================================================
    -- PHASE 1: CONCILIACIÓN ADMINISTRATIVA (Tesorería vs Facturas)
    -- ============================================================
    FOR v_mov IN 
        SELECT mt.* 
        FROM public.movimientos_tesoreria mt
        WHERE mt.organization_id = p_org_id
          AND NOT EXISTS (SELECT 1 FROM public.aplicaciones_pago ap WHERE ap.movimiento_id = mt.id)
    LOOP
        v_inv_match := NULL; 
        
        -- Buscamos el comprobante (Factura, Nota de Débito o Nota de Crédito)
        SELECT * INTO v_inv_match FROM public.comprobantes c
        WHERE c.organization_id = p_org_id
          AND c.estado NOT IN ('pagado', 'anulado', 'conciliado')
          AND (
              -- Cobros cancelan Facturas de Venta o Notas de Crédito de Compra
              (v_mov.tipo = 'cobro' AND c.tipo IN ('factura_venta', 'nota_debito_venta', 'nota_credito_compra')) 
              OR 
              -- Pagos cancelan Facturas de Compra o Notas de Crédito de Venta
              (v_mov.tipo = 'pago' AND c.tipo IN ('factura_compra', 'nota_debito_compra', 'nota_credito_venta'))
          )
          AND (c.entidad_id = v_mov.entidad_id)
          AND TRUNC(ABS(COALESCE(c.monto_pendiente, c.monto_total))) = TRUNC(ABS(v_mov.monto_total))
        ORDER BY c.fecha_emision ASC, c.created_at ASC
        LIMIT 1;

        IF v_inv_match.id IS NOT NULL THEN
            v_admin_matched := v_admin_matched + 1;
            RAISE NOTICE 'Admin Match Encontrado: Mov % con Factura %', v_mov.id, v_inv_match.id;

            IF NOT p_dry_run THEN
                INSERT INTO public.aplicaciones_pago (
                    organization_id, movimiento_id, comprobante_id, monto_aplicado
                ) VALUES (
                    p_org_id, v_mov.id, v_inv_match.id, abs(v_mov.monto_total)
                );

                UPDATE public.comprobantes
                SET monto_pendiente = GREATEST(0, COALESCE(monto_pendiente, monto_total) - abs(v_mov.monto_total)),
                    estado = CASE 
                        WHEN (COALESCE(monto_pendiente, monto_total) - abs(v_mov.monto_total)) <= 1.0 THEN 'pagado' 
                        ELSE estado 
                    END,
                    updated_at = now()
                WHERE id = v_inv_match.id;
            END IF;
        END IF;
    END LOOP;

    -- ============================================================
    -- PHASE 2: CONCILIACIÓN BANCARIA (Transacciones vs Tesorería)
    -- ============================================================
    FOR v_trans IN 
        SELECT t.* FROM public.transacciones t
        WHERE t.organization_id = p_org_id 
          AND (p_cuenta_id IS NULL OR t.cuenta_id = p_cuenta_id)
          AND t.estado IN ('pendiente', 'parcial')
          AND abs(t.monto) > 0.05
    LOOP
        v_total_read := v_total_read + 1;
        v_match_id := NULL;
        v_match_level := 0;
        v_match_label := NULL;
        v_suggestions := NULL;
        v_fail_reason := NULL;
        v_candidates_count := 0;

        -- 1. Radar de CUIT (Regex Robusta)
        BEGIN
            v_extracted_cuit := (SELECT (regexp_matches(v_trans.descripcion, '(\d{11})'))[1] LIMIT 1);
        EXCEPTION WHEN OTHERS THEN v_extracted_cuit := NULL;
        END;
        v_extracted_cuit := COALESCE(v_trans.metadata->>'cuit', v_extracted_cuit);

        -- NIVEL 1: Match por CUIT Radar (Tolerancia de decimales)
        IF v_extracted_cuit IS NOT NULL THEN
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            JOIN public.entidades e ON mt.entidad_id = e.id
            WHERE mt.organization_id = p_org_id 
              AND REGEXP_REPLACE(e.cuit, '[^0-9]', '', 'g') = v_extracted_cuit
              AND TRUNC(ABS(mt.monto_total)) = TRUNC(ABS(v_trans.monto))
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            ORDER BY mt.fecha ASC LIMIT 1;
            
            IF v_match_id IS NOT NULL THEN 
                v_match_level := 1; v_match_label := 'CUIT Coincidente'; 
            END IF;
        END IF;

        -- NIVEL 2: Trust Ledger (CBU/Alias Recordado)
        IF v_match_id IS NULL AND v_trans.metadata->>'cbu_origen' IS NOT NULL THEN
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            JOIN public.trust_ledger tl ON tl.cbu = (v_trans.metadata->>'cbu_origen')
            JOIN public.entidades e ON e.cuit = tl.cuit AND e.id = mt.entidad_id
            WHERE mt.organization_id = p_org_id 
              AND TRUNC(ABS(mt.monto_total)) = TRUNC(ABS(v_trans.monto))
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            ORDER BY mt.fecha ASC LIMIT 1;
            
            IF v_match_id IS NOT NULL THEN 
                v_match_level := 2; v_match_label := 'Memoria de CBU'; 
            END IF;
        END IF;

        -- NIVEL 3: Match por Referencia Exacta (Tolerancia decimales)
        IF v_match_id IS NULL THEN
            SELECT CASE WHEN COUNT(DISTINCT mt.id) = 1 THEN (ARRAY_AGG(mt.id))[1] ELSE NULL END INTO v_match_id
            FROM public.movimientos_tesoreria mt
            JOIN public.instrumentos_pago ip ON ip.movimiento_id = mt.id
            WHERE mt.organization_id = p_org_id
              AND TRUNC(ABS(ip.monto)) = TRUNC(ABS(v_trans.monto))
              AND RIGHT(REGEXP_REPLACE(COALESCE(ip.detalle_referencia, ''), '[^0-9]', '', 'g'), 4) = 
                  RIGHT(REGEXP_REPLACE(COALESCE(v_trans.descripcion, ''), '[^0-9]', '', 'g'), 4)
              AND LENGTH(REGEXP_REPLACE(COALESCE(ip.detalle_referencia, ''), '[^0-9]', '', 'g')) >= 4
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id);

            IF v_match_id IS NOT NULL THEN 
                v_match_level := 3; v_match_label := 'Referencia coincidente'; 
            END IF;
        END IF;

        -- NIVEL 4: Proximidad Temporal (30 días + Detección de Ambigüedad)
        IF v_match_id IS NULL THEN
            SELECT COUNT(DISTINCT mt.id) INTO v_candidates_count
            FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id = p_org_id 
              AND TRUNC(ABS(mt.monto_total)) = TRUNC(ABS(v_trans.monto))
              AND ABS(mt.fecha - v_trans.fecha) <= 30
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id);

            IF v_candidates_count = 1 THEN
                SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
                WHERE mt.organization_id = p_org_id 
                  AND TRUNC(ABS(mt.monto_total)) = TRUNC(ABS(v_trans.monto))
                  AND ABS(mt.fecha - v_trans.fecha) <= 30
                  AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id);
                v_match_level := 4; v_match_label := 'Monto exacto en el mes';
            ELSIF v_candidates_count > 1 THEN
                v_fail_reason := 'Se detectaron ' || v_candidates_count || ' movimientos internos con el mismo monto exacto ($' || TRUNC(ABS(v_trans.monto)) || '). El sistema no puede decidir solo.';
            END IF;
        END IF;

        -- ============================================================
        -- ASISTENTE: Generación de Sugerencias con Diagnóstico Real
        -- ============================================================
        IF v_match_id IS NULL THEN
            -- Caso de Ambigüedad (Monto exacto pero hay varios)
            IF v_candidates_count > 1 THEN
                SELECT jsonb_agg(jsonb_build_object(
                    'mov_id', mt.id, 'entidad', e.razon_social, 'monto', mt.monto_total,
                    'reason', 'ambiguity', 'label', 'Opción encontrada en Tesorería'
                )) INTO v_suggestions
                FROM public.movimientos_tesoreria mt
                JOIN public.entidades e ON mt.entidad_id = e.id
                WHERE mt.organization_id = p_org_id 
                  AND TRUNC(ABS(mt.monto_total)) = TRUNC(ABS(v_trans.monto))
                  AND ABS(mt.fecha - v_trans.fecha) <= 30
                  AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id);
            ELSE
                -- Caso Diferencias de Monto pero Referencia OK
                SELECT jsonb_agg(jsonb_build_object(
                    'mov_id', mt.id, 'entidad', e.razon_social, 'monto', mt.monto_total,
                    'diff', (mt.monto_total - ABS(v_trans.monto)),
                    'reason', 'monto_diff',
                    'label', CASE 
                        WHEN ABS(mt.monto_total - ABS(v_trans.monto)) < 1.0 THEN 'Monto exacto, referencia no coincide'
                        ELSE 'Diferencia de monto: $' || ROUND(ABS(mt.monto_total - ABS(v_trans.monto))::numeric, 2)
                    END
                )) INTO v_suggestions
                FROM public.movimientos_tesoreria mt
                JOIN public.instrumentos_pago ip ON ip.movimiento_id = mt.id
                JOIN public.entidades e ON mt.entidad_id = e.id
                WHERE mt.organization_id = p_org_id
                  AND RIGHT(REGEXP_REPLACE(COALESCE(ip.detalle_referencia, ''), '[^0-9]', '', 'g'), 4) = 
                      RIGHT(REGEXP_REPLACE(COALESCE(v_trans.descripcion, ''), '[^0-9]', '', 'g'), 4)
                  AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id);
            END IF;
        END IF;

        -- Diagnóstico final para lo que no tiene nada (Fondo de saco)
        IF v_match_id IS NULL AND v_suggestions IS NULL AND v_fail_reason IS NULL THEN
            v_fail_reason := 'No se encontró ningún registro interno cercano de $' || ABS(v_trans.monto) || ' en el último mes.';
        END IF;

        -- ============================================================
        -- PERSISTENCIA DE RESULTADOS
        -- ============================================================
        IF v_match_id IS NOT NULL THEN
            v_matched_count := v_matched_count + 1;
            v_matches := v_matches || jsonb_build_object(
                'transactionId', v_trans.id, 'movementId', v_match_id, 'level', v_match_level, 'method', v_match_label
            );

            IF NOT p_dry_run THEN
                UPDATE public.transacciones SET 
                    movimiento_id = v_match_id, estado = 'conciliado', monto_usado = ABS(monto),
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'match_level', v_match_level, 'match_method', v_match_label, 'reconciled_at', now()
                    ),
                    updated_at = now()
                WHERE id = v_trans.id;

                UPDATE public.instrumentos_pago SET estado = 'acreditado' WHERE movimiento_id = v_match_id;
            END IF;
        ELSE
            -- Si no hubo match, dejamos el diagnóstico claro para el usuario
            IF NOT p_dry_run THEN
                UPDATE public.transacciones SET 
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'suggestions', v_suggestions, 
                        'diagnostic_message', COALESCE(v_fail_reason, 'Requiere intervención manual'),
                        'ambiguity_detected', (v_candidates_count > 1)
                    )
                WHERE id = v_trans.id;
            END IF;
        END IF;
    END LOOP;

    -- Construimos el resultado final
    v_result := jsonb_build_object(
        'status', 'success', 'matched_count', v_matched_count, 'admin_matched', v_admin_matched,
        'total_read', v_total_read, 'dry_run', p_dry_run, 'actions', v_matches 
    );

    IF NOT p_dry_run THEN
        INSERT INTO public.reconciliation_logs (organization_id, metodo, total_leidos, total_conciliados, detalle)
        VALUES (p_org_id, 'v5.2.6_full_diagnostic', v_total_read, v_matched_count, v_result);
    END IF;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error en Motor: %', SQLERRM;
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
