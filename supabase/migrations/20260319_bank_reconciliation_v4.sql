-- Advanced Bank Reconciliation Engine v4.0 (Last 4 Digits + Truncated Amount)
-- Author: Antigravity AI
-- Date: 2026-03-19
-- Description: Optimizes matching by using only the last 4 digits of references and ignoring decimals.

CREATE OR REPLACE FUNCTION reconcile_v3_1(
    p_org_id UUID,
    p_cuenta_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_matched_count INT := 0;
    v_total_read INT := 0;
    v_trans RECORD;
    v_mov RECORD;
    v_inv_match RECORD;
    v_match_id UUID; 
    v_match_level INT;
    v_matches JSONB := '[]'::jsonb;
    v_result JSONB;
BEGIN

    -- PHASE 1: Conciliación Administrativa (Movimientos vs Facturas)
    -- Se mantiene igual para no romper la gestión interna
    FOR v_mov IN 
        SELECT mt.* FROM public.movimientos_tesoreria mt
        WHERE mt.organization_id = p_org_id
          AND NOT EXISTS (SELECT 1 FROM public.aplicaciones_pago ap WHERE ap.movimiento_id = mt.id)
    LOOP
        v_inv_match := NULL; 

        SELECT * INTO v_inv_match FROM public.comprobantes c
        WHERE c.organization_id = p_org_id
          AND c.estado NOT IN ('pagado', 'anulado', 'conciliado')
          AND ( (v_mov.tipo = 'cobro' AND c.tipo = 'factura_venta') OR (v_mov.tipo = 'pago' AND c.tipo = 'factura_compra') )
          AND (c.entidad_id = v_mov.entidad_id)
          AND abs(COALESCE(c.monto_pendiente, c.monto_total) - abs(v_mov.monto_total)) <= 2.0
        ORDER BY fecha_emision ASC 
        LIMIT 1;

        IF v_inv_match.id IS NOT NULL THEN
            IF NOT p_dry_run THEN
                INSERT INTO public.aplicaciones_pago (organization_id, movimiento_id, comprobante_id, monto_aplicado)
                VALUES (p_org_id, v_mov.id, v_inv_match.id, abs(v_mov.monto_total));

                UPDATE public.comprobantes
                SET monto_pendiente = GREATEST(0, COALESCE(monto_pendiente, monto_total) - abs(v_mov.monto_total)),
                    estado = CASE 
                        WHEN (COALESCE(monto_pendiente, monto_total) - abs(v_mov.monto_total)) <= 2.0 THEN 'pagado' 
                        ELSE estado 
                    END
                WHERE id = v_inv_match.id;
            END IF;
        END IF;
    END LOOP;

    -- PHASE 2: Conciliación Bancaria V4.0 (Extracto vs Gestión)
    FOR v_trans IN 
        SELECT * FROM public.transacciones 
        WHERE organization_id = p_org_id 
          AND (p_cuenta_id IS NULL OR cuenta_id = p_cuenta_id)
          AND estado IN ('pendiente', 'parcial')
          AND abs(monto) > 0.05
    LOOP
        v_total_read := v_total_read + 1;
        v_match_id := NULL;
        v_match_level := 0;

        -- L1: CUIT Exacto (si viene en metadata)
        IF v_trans.metadata->>'cuit' IS NOT NULL THEN
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            JOIN public.entidades e ON mt.entidad_id = e.id
            WHERE mt.organization_id = p_org_id 
              AND e.cuit = v_trans.metadata->>'cuit'
              AND TRUNC(ABS(mt.monto_total)) = TRUNC(ABS(v_trans.monto))
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            ORDER BY mt.fecha ASC LIMIT 1;
            IF v_match_id IS NOT NULL THEN v_match_level := 1; END IF;
        END IF;

        -- L2: Trust Ledger (CBU/Alias previo)
        IF v_match_id IS NULL AND v_trans.metadata->>'cbu_origen' IS NOT NULL THEN
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            JOIN public.trust_ledger tl ON tl.cbu = (v_trans.metadata->>'cbu_origen')
            JOIN public.entidades e ON e.cuit = tl.cuit AND e.id = mt.entidad_id
            WHERE mt.organization_id = p_org_id 
              AND TRUNC(ABS(mt.monto_total)) = TRUNC(ABS(v_trans.monto))
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            ORDER BY mt.fecha ASC LIMIT 1;
            IF v_match_id IS NOT NULL THEN v_match_level := 2; END IF;
        END IF;

        -- L3: REGLA V4.0 - 4 DÍGITOS Y MONTO ENTERO
        IF v_match_id IS NULL THEN
            WITH matches AS (
                SELECT 
                    mt.id as mov_id
                FROM public.movimientos_tesoreria mt
                JOIN public.instrumentos_pago ip ON ip.movimiento_id = mt.id
                WHERE mt.organization_id = p_org_id
                  -- Importe sin decimales
                  AND TRUNC(ABS(ip.monto)) = TRUNC(ABS(v_trans.monto))
                  -- 4 últimos dígitos ignorando letras/símbolos
                  AND RIGHT(REGEXP_REPLACE(COALESCE(ip.referencia, ''), '[^0-9]', '', 'g'), 4) = 
                      RIGHT(REGEXP_REPLACE(COALESCE(v_trans.descripcion, ''), '[^0-9]', '', 'g'), 4)
                  -- Seguridad: la referencia de gestión debe tener al menos 4 números
                  AND LENGTH(REGEXP_REPLACE(COALESCE(ip.referencia, ''), '[^0-9]', '', 'g')) >= 4
                  AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            )
            SELECT mov_id INTO v_match_id 
            FROM matches 
            GROUP BY mov_id 
            HAVING COUNT(*) = 1; -- UNICIDDAD: Solo si hay un único candidato

            IF v_match_id IS NOT NULL THEN v_match_level := 3; END IF;
        END IF;

        -- L4: Proximidad (Último recurso)
        IF v_match_id IS NULL THEN
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id = p_org_id 
              AND ABS(mt.monto_total - ABS(v_trans.monto)) <= 0.05
              AND ABS(mt.fecha - v_trans.fecha) <= 3
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            GROUP BY id HAVING COUNT(*) = 1;
            IF v_match_id IS NOT NULL THEN v_match_level := 4; END IF;
        END IF;

        -- Aplicar Match si se encontró uno válido
        IF v_match_id IS NOT NULL THEN
            v_matched_count := v_matched_count + 1;
            v_matches := v_matches || jsonb_build_object(
                'id', gen_random_uuid(),
                'transactionId', v_trans.id,
                'movementId', v_match_id,
                'level', v_match_level
            );

            IF NOT p_dry_run THEN
                UPDATE public.transacciones 
                SET movimiento_id = v_match_id, 
                    estado = 'conciliado', 
                    monto_usado = ABS(monto),
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'match_level', v_match_level, 
                        'method', 'v4.0_4digits_auto'
                    )
                WHERE id = v_trans.id;
                
                UPDATE public.instrumentos_pago SET estado = 'acreditado' WHERE movimiento_id = v_match_id;
            END IF;
        END IF;
    END LOOP;

    v_result := jsonb_build_object(
        'status', 'success', 
        'matched_count', v_matched_count, 
        'total_read', v_total_read,
        'dry_run', p_dry_run, 
        'matches', v_matches
    );

    IF NOT p_dry_run THEN
        INSERT INTO public.reconciliation_logs (organization_id, metodo, total_leidos, total_conciliados, detalle)
        VALUES (p_org_id, 'auto_rpc_v4_4digits', v_total_read, v_matched_count, v_result);
    END IF;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
