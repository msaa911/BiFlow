-- Advanced Bank Reconciliation Engine v5.3.0 (TOTAL & EXPANDED)
-- Author: Antigravity AI
-- Date: 2026-03-19
-- Rules: ROUND(monto, 0). 10-day window. Sequential Aging (Date > Num).

CREATE OR REPLACE FUNCTION public.reconcile_v3_1(
    p_org_id UUID,
    p_cuenta_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    -- Contadores (Audit)
    v_matched_count INT := 0;
    v_total_read INT := 0;
    v_admin_matched INT := 0;
    
    -- Registros Temporales
    v_trans RECORD;
    v_mov RECORD;
    v_inv_match RECORD;
    
    -- Variables de Control de Match
    v_match_id UUID; 
    v_match_level INT;
    v_match_label TEXT;
    v_suggestions JSONB;
    v_extracted_cuit TEXT;
    
    -- Variables de Diagnóstico
    v_result JSONB;
    v_fail_reason TEXT;
    v_candidates_count INT;
    v_is_bank_expense BOOLEAN;
BEGIN
    RAISE NOTICE 'Iniciando Reconciliación V5.3.0 (10 días / Aging Secuencial)';

    -- ============================================================
    -- FASE 1: CONCILIACIÓN ADMINISTRATIVA (Tesorería -> Facturas)
    -- ============================================================
    FOR v_mov IN 
        SELECT mt.* 
        FROM public.movimientos_tesoreria mt
        WHERE mt.organization_id = p_org_id 
          AND NOT EXISTS (
              SELECT 1 
              FROM public.aplicaciones_pago ap 
              WHERE ap.movimiento_id = mt.id
          )
    LOOP
        v_inv_match := NULL; 
        
        -- Buscamos el comprobante por monto redondeado
        SELECT * INTO v_inv_match 
        FROM public.comprobantes c
        WHERE c.organization_id = p_org_id 
          AND c.estado NOT IN ('pagado', 'anulado', 'conciliado')
          AND (
              (v_mov.tipo = 'cobro' AND c.tipo IN ('factura_venta', 'nota_debito_venta')) 
              OR 
              (v_mov.tipo = 'pago' AND c.tipo IN ('factura_compra', 'nota_debito_compra'))
          )
          AND (c.entidad_id = v_mov.entidad_id)
          AND ROUND(ABS(COALESCE(c.monto_pendiente, c.monto_total)), 0) = ROUND(ABS(v_mov.monto_total), 0)
        ORDER BY c.fecha_emision ASC, c.numero ASC, c.created_at ASC
        LIMIT 1;

        IF v_inv_match.id IS NOT NULL THEN
            v_admin_matched := v_admin_matched + 1;
            
            IF NOT p_dry_run THEN
                -- Registrar aplicación de pago
                INSERT INTO public.aplicaciones_pago (
                    organization_id, 
                    movimiento_id, 
                    comprobante_id, 
                    monto_aplicado
                ) VALUES (
                    p_org_id, 
                    v_mov.id, 
                    v_inv_match.id, 
                    abs(v_mov.monto_total)
                );

                -- Actualizar saldo del comprobante
                UPDATE public.comprobantes
                SET monto_pendiente = GREATEST(0, COALESCE(monto_pendiente, monto_total) - abs(v_mov.monto_total)),
                    estado = CASE 
                        WHEN (COALESCE(monto_pendiente, monto_total) - abs(v_mov.monto_total)) <= 1.0 THEN 'pagado' 
                        ELSE estado 
                    END
                WHERE id = v_inv_match.id;
            END IF;
        END IF;
    END LOOP;

    -- ============================================================
    -- FASE 2: CONCILIACIÓN BANCARIA (Banco -> Tesorería)
    -- ============================================================
    FOR v_trans IN 
        SELECT t.* 
        FROM public.transacciones t
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

        -- ¿Es un gasto bancario directo? (No tiene contrapartida en tesorería)
        v_is_bank_expense := (
            v_trans.descripcion ~* 'COMISION' OR 
            v_trans.descripcion ~* 'MANTENIMIENTO' OR 
            v_trans.descripcion ~* 'IMPUESTO' OR 
            v_trans.descripcion ~* 'IVA' OR 
            v_trans.descripcion ~* 'GASTO' OR 
            v_trans.descripcion ~* 'INTERES'
        );

        IF v_is_bank_expense THEN
            v_fail_reason := 'Gasto bancario directo: Genere una Nota Bancaria.';
        ELSE
            -- NIVEL 1: Radar de CUIT
            BEGIN
                v_extracted_cuit := (SELECT (regexp_matches(v_trans.descripcion, '(\d{11})'))[1] LIMIT 1);
            EXCEPTION WHEN OTHERS THEN 
                v_extracted_cuit := NULL; 
            END;

            IF v_extracted_cuit IS NOT NULL THEN
                SELECT mt.id INTO v_match_id 
                FROM public.movimientos_tesoreria mt 
                JOIN public.entidades e ON mt.entidad_id = e.id
                WHERE mt.organization_id = p_org_id 
                  AND REGEXP_REPLACE(e.cuit, '[^0-9]', '', 'g') = v_extracted_cuit
                  AND ROUND(ABS(mt.monto_total), 0) = ROUND(ABS(v_trans.monto), 0) 
                  AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
                ORDER BY mt.fecha ASC 
                LIMIT 1;
                
                IF v_match_id IS NOT NULL THEN 
                    v_match_level := 1; 
                    v_match_label := 'CUIT Encontrado'; 
                END IF;
            END IF;

            -- NIVEL 3: Referencia de 4 dígitos
            IF v_match_id IS NULL AND v_trans.descripcion ~ '\d{4}' THEN
                SELECT CASE WHEN COUNT(DISTINCT mt.id) = 1 THEN (ARRAY_AGG(mt.id))[1] ELSE NULL END INTO v_match_id
                FROM public.movimientos_tesoreria mt
                JOIN public.instrumentos_pago ip ON ip.movimiento_id = mt.id
                WHERE mt.organization_id = p_org_id
                  AND ROUND(ABS(ip.monto), 0) = ROUND(ABS(v_trans.monto), 0)
                  AND RIGHT(REGEXP_REPLACE(COALESCE(ip.detalle_referencia, ''), '[^0-9]', '', 'g'), 4) = 
                      RIGHT(REGEXP_REPLACE(COALESCE(v_trans.descripcion, ''), '[^0-9]', '', 'g'), 4)
                  AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id);
                
                IF v_match_id IS NOT NULL THEN 
                    v_match_level := 3; 
                    v_match_label := 'Referencia coincidente'; 
                END IF;
            END IF;

            -- NIVEL 4: Monto Redondeado (Unicidad y Fecha)
            IF v_match_id IS NULL THEN
                SELECT COUNT(DISTINCT mt.id) INTO v_candidates_count 
                FROM public.movimientos_tesoreria mt
                WHERE mt.organization_id = p_org_id 
                  AND ROUND(ABS(mt.monto_total), 0) = ROUND(ABS(v_trans.monto), 0)
                  AND ABS(mt.fecha - v_trans.fecha) <= 10 
                  AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id);

                IF v_candidates_count = 1 THEN
                    SELECT id INTO v_match_id FROM public.movimientos_tesoreria mt 
                    WHERE mt.organization_id = p_org_id 
                      AND ROUND(ABS(mt.monto_total), 0) = ROUND(ABS(v_trans.monto), 0) 
                      AND ABS(mt.fecha - v_trans.fecha) <= 30 
                      AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id);
                    
                    v_match_level := 4; 
                    v_match_label := 'Monto Redondeado';
                ELSIF v_candidates_count > 1 THEN
                    v_fail_reason := 'Ambigüedad: se hallaron ' || v_candidates_count || ' registros con el mismo importe.';
                    
                    SELECT jsonb_agg(jsonb_build_object(
                        'mov_id', mt.id, 
                        'entidad', e.razon_social, 
                        'monto', mt.monto_total, 
                        'label', 'Opción en Tesorería'
                    )) INTO v_suggestions 
                    FROM (
                        SELECT mt.* 
                        FROM public.movimientos_tesoreria mt 
                        WHERE mt.organization_id = p_org_id 
                          AND ROUND(ABS(mt.monto_total), 0) = ROUND(ABS(v_trans.monto), 0) 
                        LIMIT 3
                    ) mt 
                    JOIN public.entidades e ON mt.entidad_id = e.id;
                END IF;
            END IF;
        END IF;

        -- Diagnóstico final si nada coincidió
        IF v_match_id IS NULL AND v_fail_reason IS NULL THEN 
            v_fail_reason := 'No hay registros por $' || ROUND(ABS(v_trans.monto), 0) || ' en los últimos 10 días.'; 
        END IF;

        -- Persistencia y Actualización
        IF v_match_id IS NOT NULL THEN
            v_matched_count := v_matched_count + 1;
            
            IF NOT p_dry_run THEN
                UPDATE public.transacciones 
                SET movimiento_id = v_match_id, 
                    estado = 'conciliado', 
                    monto_usado = ABS(monto),
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'match_level', v_match_level, 
                        'match_label', v_match_label,
                        'reconciled_at', now()
                    )
                WHERE id = v_trans.id;

                UPDATE public.instrumentos_pago 
                SET estado = 'acreditado' 
                WHERE movimiento_id = v_match_id;
            END IF;
        ELSE
            IF NOT p_dry_run THEN
                UPDATE public.transacciones 
                SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'suggestions', v_suggestions, 
                        'diagnostic_message', v_fail_reason
                    ) 
                WHERE id = v_trans.id;
            END IF;
        END IF;
    END LOOP;

    -- Resultado final (Siempre preparado para evitar error RPC)
    v_result := jsonb_build_object(
        'status', 'success', 
        'matched_count', v_matched_count, 
        'admin_results', v_admin_matched,
        'total_read', v_total_read
    );

    IF NOT p_dry_run THEN
        INSERT INTO public.reconciliation_logs (
            organization_id, 
            metodo, 
            total_leidos, 
            total_conciliados, 
            detalle
        ) VALUES (
            p_org_id, 
            'v5.3.0_10_days', 
            v_total_read, 
            v_matched_count, 
            v_result
        );
    END IF;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error Crítico V5.2.16: %', SQLERRM;
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
