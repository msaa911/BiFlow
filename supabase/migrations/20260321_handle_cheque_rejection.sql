-- Function to handle check rejection atomically
-- Reactivates original debt and marks instrument as rejected.

CREATE OR REPLACE FUNCTION public.handle_cheque_rejection(
    p_instrument_id UUID,
    p_fee_amount NUMERIC DEFAULT 0,
    p_transaction_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_movimiento_id UUID;
    v_org_id UUID;
    v_entidad_id UUID;
    v_monto_check NUMERIC;
    v_comprobante_count INTEGER := 0;
    v_fee_movimiento_id UUID;
BEGIN
    -- 1. Get check details
    SELECT 
        mt.id, 
        mt.organization_id, 
        mt.entidad_id, 
        ip.monto 
    INTO 
        v_movimiento_id, 
        v_org_id, 
        v_entidad_id, 
        v_monto_check
    FROM public.instrumentos_pago ip
    JOIN public.movimientos_tesoreria mt ON ip.movimiento_id = mt.id
    WHERE ip.id = p_instrument_id;

    IF v_movimiento_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Instrumento no encontrado');
    END IF;

    -- 2. Update Check Status
    UPDATE public.instrumentos_pago 
    SET estado = 'rechazado' 
    WHERE id = p_instrument_id;

    -- 3. Reactivate Invoices (Restore monto_pendiente)
    WITH updated AS (
        UPDATE public.comprobantes c
        SET 
            monto_pendiente = c.monto_pendiente + ap.monto_aplicado,
            estado = CASE 
                WHEN (c.monto_pendiente + ap.monto_aplicado) >= c.monto_total THEN 'pendiente'
                ELSE 'parcial'
            END
        FROM public.aplicaciones_pago ap
        WHERE ap.comprobante_id = c.id
          AND ap.movimiento_id = v_movimiento_id
        RETURNING c.id
    )
    SELECT count(*) INTO v_comprobante_count FROM updated;

    -- 4. Handle Fee (if any)
    IF p_fee_amount > 0 THEN
        INSERT INTO public.movimientos_tesoreria (
            organization_id, 
            entidad_id, 
            tipo, 
            monto_total, 
            concepto, 
            observaciones
        )
        VALUES (
            v_org_id, 
            v_entidad_id, 
            'pago', 
            p_fee_amount, 
            'GASTO BANCARIO POR RECHAZO', 
            'Comisión automática por rechazo de instrumento ' || p_instrument_id
        )
        RETURNING id INTO v_fee_movimiento_id;

        -- Create instrument for fee (bank expense)
        INSERT INTO public.instrumentos_pago (
            movimiento_id, 
            metodo, 
            monto, 
            estado
        )
        VALUES (
            v_fee_movimiento_id, 
            'transferencia', 
            p_fee_amount, 
            'acreditado'
        );
    END IF;

    -- 5. Link with Bank Transaction (if provided)
    IF p_transaction_id IS NOT NULL THEN
        UPDATE public.transacciones
        SET 
            estado = 'conciliado',
            metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{rejection_info}',
                jsonb_build_object(
                    'instrument_id', p_instrument_id,
                    'reconciled_at', now()
                )
            )
        WHERE id = p_transaction_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'affected_invoices', v_comprobante_count,
        'fee_movimiento_id', v_fee_movimiento_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
