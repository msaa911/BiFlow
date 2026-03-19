-- Final Atomic Reconciliation Engine v3.2.9 (Suggestions-Ready)
-- Includes:
-- - Atomic Phase 1 (Administrative) & Phase 2 (Banking)
-- - Socio Support (entidad_id OR socio_id)
-- - Elastic Number Matching (handles leading zeros and symbols)
-- - Length Guards (min 4 chars) to prevent false positives
-- - Correct Statistics for dry_run and match results
-- - FIX v3.2.9: Return detailed matches in dry_run mode for the Suggestions UI

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
    v_match_id UUID;
    v_inv_match RECORD;
    v_match_level INT;
    v_desc_clean TEXT;
    v_result JSONB;
    v_matches JSONB := '[]'::jsonb; -- <--- v3.2.9: Accumulator for dry_run matches
BEGIN

    -- PHASE 1: Conciliación Administrativa (Movimientos vs Facturas)
    FOR v_mov IN 
        SELECT mt.* FROM public.movimientos_tesoreria mt
        WHERE mt.organization_id = p_org_id
          AND NOT EXISTS (SELECT 1 FROM public.aplicaciones_pago ap WHERE ap.movimiento_id = mt.id)
    LOOP
        v_total_read := v_total_read + 1;
        v_inv_match := NULL; 

        SELECT * INTO v_inv_match FROM public.comprobantes c
        WHERE c.organization_id = p_org_id
          AND c.estado NOT IN ('pagado', 'anulado', 'conciliado')
          AND ( (v_mov.tipo = 'cobro' AND c.tipo = 'factura_venta') OR (v_mov.tipo = 'pago' AND c.tipo = 'factura_compra') )
          AND (c.entidad_id = v_mov.entidad_id)
          AND abs(COALESCE(c.monto_pendiente, c.monto_total) - abs(v_mov.monto_total)) <= 2.0
          AND length(regexp_replace(COALESCE(c.nro_factura, ''), '[^A-Z0-9]', '', 'g')) >= 4
          AND (
              upper(v_mov.concepto || ' ' || COALESCE(v_mov.observaciones, '') || ' ' || COALESCE(v_mov.nro_comprobante, '')) 
              LIKE '%' || upper(regexp_replace(c.nro_factura, '[^A-Z0-9]', '', 'g')) || '%'
              OR
              upper(v_mov.concepto || ' ' || COALESCE(v_mov.observaciones, '') || ' ' || COALESCE(v_mov.nro_comprobante, '')) 
              LIKE '%' || ltrim(regexp_replace(c.nro_factura, '[^0-9]', '', 'g'), '0') || '%'
          )
        ORDER BY fecha_emision ASC 
        LIMIT 1;

        IF v_inv_match.id IS NOT NULL THEN
            v_matched_count := v_matched_count + 1;
            
            -- v3.2.9: Record match for suggestions
            v_matches := v_matches || jsonb_build_object(
                'id', gen_random_uuid(),
                'type', 'admin',
                'level', 1,
                'movement', jsonb_build_object('id', v_mov.id, 'concepto', v_mov.concepto, 'monto', v_mov.monto_total),
                'invoice', jsonb_build_object('id', v_inv_match.id, 'numero', v_inv_match.nro_factura, 'monto', v_inv_match.monto_total)
            );

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

    -- PHASE 2: Conciliación Bancaria (Transacciones vs Movimientos)
    FOR v_trans IN 
        SELECT * FROM public.transacciones 
        WHERE organization_id = p_org_id 
          AND (p_cuenta_id IS NULL OR cuenta_id = p_cuenta_id)
          AND estado IN ('pendiente', 'parcial')
          AND (abs(monto) - abs(COALESCE(monto_usado, 0))) > 0.05
    LOOP
        v_total_read := v_total_read + 1;
        v_match_id := NULL;
        v_match_level := 0;

        -- We'll reuse the logic from v3.2.8 but record the matches
        -- L1: CUIT Exacto
        IF v_trans.cuit IS NOT NULL THEN
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id = p_org_id AND abs(mt.monto_total - abs(v_trans.monto)) <= 2.0
              AND EXISTS (SELECT 1 FROM public.entidades e WHERE e.id = mt.entidad_id AND e.cuit = v_trans.cuit)
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            ORDER BY mt.fecha ASC LIMIT 1;
            IF v_match_id IS NOT NULL THEN v_match_level := 1; END IF;
        END IF;

        -- L2: Trust Ledger
        IF v_match_id IS NULL THEN
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id = p_org_id AND abs(mt.monto_total - abs(v_trans.monto)) <= 2.0
              AND EXISTS (SELECT 1 FROM public.trust_ledger tl WHERE tl.organization_id = p_org_id AND tl.cbu = (v_trans.metadata->>'cbu_origen')
                          AND EXISTS (SELECT 1 FROM public.entidades e WHERE e.id = mt.entidad_id AND e.cuit = tl.cuit))
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            ORDER BY mt.fecha ASC LIMIT 1;
            IF v_match_id IS NOT NULL THEN v_match_level := 2; END IF;
        END IF;

        -- L3: Fuzzy Reference
        IF v_match_id IS NULL THEN
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id = p_org_id AND abs(mt.monto_total - abs(v_trans.monto)) <= 2.0
              AND COALESCE(mt.nro_comprobante, '') != ''
              AND length(ltrim(regexp_replace(mt.nro_comprobante, '\D', '', 'g'), '0')) >= 4
              AND (upper(COALESCE(v_trans.descripcion_normalizada, v_trans.descripcion, '')) LIKE '%' || upper(mt.nro_comprobante) || '%'
                   OR upper(COALESCE(v_trans.descripcion_normalizada, v_trans.descripcion, '')) LIKE '%' || ltrim(regexp_replace(mt.nro_comprobante, '\D', '', 'g'), '0') || '%')
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            ORDER BY mt.fecha ASC LIMIT 1;
            IF v_match_id IS NOT NULL THEN v_match_level := 3; END IF;
        END IF;

        -- L4: Proximity
        IF v_match_id IS NULL THEN
            SELECT id INTO v_match_id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id = p_org_id AND abs(mt.monto_total - abs(v_trans.monto)) <= 0.05
              AND abs(mt.fecha - v_trans.fecha) <= 3
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            GROUP BY id HAVING count(*) = 1;
            IF v_match_id IS NOT NULL THEN v_match_level := 4; END IF;
        END IF;

        IF v_match_id IS NOT NULL THEN
            v_matched_count := v_matched_count + 1;
            
            -- v3.2.9: Record bank match
            v_matches := v_matches || jsonb_build_object(
                'id', gen_random_uuid(),
                'type', 'bank',
                'level', v_match_level,
                'transactionId', v_trans.id,
                'movementId', v_match_id
            );

            IF NOT p_dry_run THEN
                UPDATE public.transacciones 
                SET movimiento_id = v_match_id, estado = 'conciliado', monto_usado = abs(monto),
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('linked_at', now(), 'match_level', v_match_level, 'method', 'auto_rpc_v3.2.9')
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
        'actions', v_matches -- <--- v3.2.9: Returning actions for the UI
    );

    IF NOT p_dry_run THEN
        INSERT INTO public.reconciliation_logs (organization_id, metodo, total_leidos, total_conciliados, detalle)
        VALUES (p_org_id, 'auto_rpc_v3_full_atomic', v_total_read, v_matched_count, v_result);
    END IF;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
