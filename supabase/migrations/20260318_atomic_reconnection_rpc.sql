-- Final Atomic Reconciliation Engine v3.2.8 (Master)
-- Includes:
-- - Atomic Phase 1 (Administrative) & Phase 2 (Banking)
-- - Socio Support (entidad_id OR socio_id)
-- - Elastic Number Matching (handles leading zeros and symbols)
-- - Length Guards (min 4 chars) to prevent false positives
-- - Correct Statistics for dry_run and match results
-- - Automatic payment application and status updates

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
          AND (COALESCE(c.entidad_id, c.socio_id) = COALESCE(v_mov.entidad_id, v_mov.socio_id))
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
        v_desc_clean := upper(COALESCE(v_trans.descripcion_normalizada, v_trans.descripcion, ''));

        -- L1: CUIT Exacto
        IF v_trans.cuit IS NOT NULL THEN
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id = p_org_id 
              AND abs(mt.monto_total - abs(v_trans.monto)) <= 2.0
              AND (
                  EXISTS (SELECT 1 FROM public.entidades e WHERE e.id = mt.entidad_id AND e.cuit = v_trans.cuit)
                  OR EXISTS (SELECT 1 FROM public.socios s WHERE s.id = mt.socio_id AND s.cuit = v_trans.cuit)
              )
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            ORDER BY mt.fecha ASC 
            LIMIT 1;
            IF v_match_id IS NOT NULL THEN v_match_level := 1; END IF;
        END IF;

        -- L2: Trust Ledger (CBU Match)
        IF v_match_id IS NULL THEN
            WITH matched_cbu AS (
                SELECT cuit FROM public.trust_ledger WHERE organization_id = p_org_id AND cbu = (v_trans.metadata->>'cbu_origen') LIMIT 1
            )
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            JOIN matched_cbu mc ON (
                EXISTS (SELECT 1 FROM public.entidades e WHERE e.id = mt.entidad_id AND e.cuit = mc.cuit)
                OR EXISTS (SELECT 1 FROM public.socios s WHERE s.id = mt.socio_id AND s.cuit = mc.cuit)
            )
            WHERE mt.organization_id = p_org_id AND abs(mt.monto_total - abs(v_trans.monto)) <= 2.0
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            ORDER BY mt.fecha ASC
            LIMIT 1;
            IF v_match_id IS NOT NULL THEN v_match_level := 2; END IF;
        END IF;

        -- L3: Fuzzy Reference
        IF v_match_id IS NULL THEN
            SELECT mt.id INTO v_match_id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id = p_org_id AND abs(mt.monto_total - abs(v_trans.monto)) <= 2.0
              AND COALESCE(mt.nro_comprobante, '') != ''
              AND length(ltrim(regexp_replace(COALESCE(mt.nro_comprobante, ''), '\D', '', 'g'), '0')) >= 4
              AND ( v_desc_clean LIKE '%' || upper(mt.nro_comprobante) || '%'
                    OR v_desc_clean LIKE '%' || ltrim(regexp_replace(mt.nro_comprobante, '\D', '', 'g'), '0') || '%' )
              AND NOT EXISTS (SELECT 1 FROM public.transacciones WHERE movimiento_id = mt.id)
            ORDER BY mt.fecha ASC
            LIMIT 1;
            IF v_match_id IS NOT NULL THEN v_match_level := 3; END IF;
        END IF;

        -- L4: Proximidad de Monto
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
            IF NOT p_dry_run THEN
                UPDATE public.transacciones 
                SET movimiento_id = v_match_id, estado = 'conciliado', monto_usado = abs(monto),
                    metadata = COALESCE(metadata, '{}'::jsonb) || json_build_object('linked_at', now(), 'match_level', v_match_level, 'method', 'auto_rpc_v3_full_atomic_v3.2.8_final')
                WHERE id = v_trans.id;
                UPDATE public.instrumentos_pago SET estado = 'acreditado' WHERE movimiento_id = v_match_id;
            END IF;
        END IF;
    END LOOP;

    v_result := jsonb_build_object('status', 'success', 'matched_count', v_matched_count, 'total_read', v_total_read, 'dry_run', p_dry_run);

    IF NOT p_dry_run THEN
        INSERT INTO public.reconciliation_logs (organization_id, metodo, total_leidos, total_conciliados, detalle)
        VALUES (p_org_id, 'auto_rpc_v3_full_atomic', v_total_read, v_matched_count, v_result);
    END IF;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
