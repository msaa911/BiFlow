-- BORRADOR DE MOTOR DE CONCILIACIÓN BiFlow v3.1 (Verificado para Mar-18)
-- Este archivo es una propuesta técnica. No ejecutar sin antes probar en Staging.

-- 1. Crear tabla de auditoría si no existe
CREATE TABLE IF NOT EXISTS public.reconciliation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    organization_id UUID,
    metodo TEXT, -- 'auto_rpc_v3.1'
    total_leidos INT,
    total_conciliados INT,
    detalle JSONB -- Detalles técnicos del funnel
);

-- 2. Función Maestra de Conciliación
CREATE OR REPLACE FUNCTION reconcile_v3_1(
    p_org_id UUID,
    p_cuenta_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_matched_count INT := 0;
    v_total_read INT := 0;
    v_trans RECORD;
    v_match_id UUID;
    v_match_level INT;
    v_desc_clean TEXT;
    v_result JSONB;
BEGIN
    -- PHASE 0: Sincronización de Huérfanos (Orphans)
    -- Ajustamos el estado de transacciones que ya tienen movimiento_id pero están en 'pendiente'
    IF NOT p_dry_run THEN
        UPDATE public.transacciones 
        SET estado = CASE 
            WHEN abs(monto_usado) >= abs(monto) - 0.05 THEN 'conciliado' 
            ELSE 'parcial' 
        END
        WHERE organization_id = p_org_id 
          AND movimiento_id IS NOT NULL 
          AND estado = 'pendiente';
    END IF;

    -- PHASE 1: Conciliación Administrativa (Invoices <-> Movements)
    -- (Omitido en este borrador por brevedad, se añade en versión final)

    -- PHASE 2: Conciliación Bancaria (Transactions <-> Movements)
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

        -- L1: CUIT Exacto (Mayor confianza)
        IF v_trans.cuit IS NOT NULL THEN
            SELECT id INTO v_match_id 
            FROM public.movimientos_tesoreria
            WHERE organization_id = p_org_id 
              AND abs(monto_total - abs(v_trans.monto)) <= 2.0
              AND estado IN ('pendiente', 'parcial')
              AND (SELECT cuit FROM public.entidades WHERE id = entidad_id) = v_trans.cuit
            LIMIT 1;
            
            IF v_match_id IS NOT NULL THEN v_match_level := 1; END IF;
        END IF;

        -- L2: Trust Ledger (CBU Match)
        -- (Requiere tabla trust_ledger para buscar CUIT asociado al CBU del v_trans.metadata)
        
        -- L3: Fuzzy Reference (Nro Factura / Referencia)
        IF v_match_id IS NULL THEN
            -- Buscamos si el numero de comprobante del movimiento esta en la descripcion bancaria
            SELECT id INTO v_match_id
            FROM public.movimientos_tesoreria
            WHERE organization_id = p_org_id
              AND abs(monto_total - abs(v_trans.monto)) <= 2.0
              AND estado IN ('pendiente', 'parcial')
              AND (
                  v_desc_clean LIKE '%' || upper(nro_comprobante) || '%'
                  -- O la versión "nuda" sin ceros a la izquierda
                  OR v_desc_clean LIKE '%' || ltrim(regexp_replace(nro_comprobante, '\D', '', 'g'), '0') || '%'
              )
            LIMIT 1;
            
            IF v_match_id IS NOT NULL THEN v_match_level := 3; END IF;
        END IF;

        -- L4: Proximidad de Monto (Solo si no hay dudas de duplicados)
        IF v_match_id IS NULL THEN
            -- Implementar lógica de 1-a-1 por monto y fecha (+/- 3 días)
        END IF;

        -- EJECUCIÓN (Solo si no es Dry Run)
        IF v_match_id IS NOT NULL AND NOT p_dry_run THEN
            -- 1. Vincular transaccion bancaria
            UPDATE public.transacciones 
            SET movimiento_id = v_match_id,
                estado = 'conciliado',
                monto_usado = monto,
                metadata = metadata || jsonb_build_object('linked_at', now(), 'match_level', v_match_level, 'method', 'auto_rpc_v3.1')
            WHERE id = v_trans.id;

            -- 2. Marcar movimiento e instrumentos como acreditados
            UPDATE public.movimientos_tesoreria SET estado = 'conciliado' WHERE id = v_match_id;
            UPDATE public.instrumentos_pago SET estado = 'acreditado' WHERE movimiento_id = v_match_id;

            v_matched_count := v_matched_count + 1;
        END IF;

    END LOOP;

    -- Resultado final
    v_result := jsonb_build_object(
        'status', 'success',
        'matched_count', v_matched_count,
        'total_read', v_total_read,
        'dry_run', p_dry_run
    );

    -- Loggear
    IF NOT p_dry_run THEN
        INSERT INTO public.reconciliation_logs (organization_id, metodo, total_leidos, total_conciliados, detalle)
        VALUES (p_org_id, 'auto_rpc_v3.1', v_total_read, v_matched_count, v_result);
    END IF;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
