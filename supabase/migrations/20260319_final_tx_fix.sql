-- =============================================
-- Migration: Transaction RLS Cleanup & RPC Fix
-- Date: 2026-03-19
-- Description: Repairs RLS issues for transactions and provides a robust RPC.
-- =============================================

BEGIN;

-- 1. Unify RLS on transacciones (Clean Slate)
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'transacciones' AND schemaname = 'public' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.transacciones', pol.policyname);
    END LOOP;
END $$;

ALTER TABLE public.transacciones ENABLE ROW LEVEL SECURITY;

-- SELECT policy
CREATE POLICY "transacciones_select" ON public.transacciones
    FOR SELECT TO authenticated USING (is_org_member(organization_id));

-- INSERT policy
CREATE POLICY "transacciones_insert" ON public.transacciones
    FOR INSERT TO authenticated WITH CHECK (is_org_member(organization_id));

-- UPDATE policy (The critical fix)
CREATE POLICY "transacciones_update" ON public.transacciones
    FOR UPDATE TO authenticated USING (is_org_member(organization_id));

-- DELETE policy
CREATE POLICY "transacciones_delete" ON public.transacciones
    FOR DELETE TO authenticated USING (is_org_member(organization_id));


-- 2. CREATE robust RPC as a fallback/standard for UI categorization
CREATE OR REPLACE FUNCTION public.categorize_tx_v1(
    p_tx_id UUID,
    p_voucher_id UUID,
    p_monto_usado NUMERIC,
    p_metadata JSONB,
    p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_count INT;
BEGIN
    -- Security Check
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = auth.uid()
        AND organization_id = p_organization_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permisos insuficientes para esta organización');
    END IF;

    -- Update with elevated privileges
    UPDATE public.transacciones
    SET 
        estado = 'conciliado',
        comprobante_id = p_voucher_id,
        monto_usado = p_monto_usado,
        metadata = p_metadata
    WHERE id = p_tx_id
    AND organization_id = p_organization_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se encontró la transacción o ya no pertenece a la organización');
    END IF;

    RETURN jsonb_build_object('success', true, 'updated_id', p_tx_id);
END;
$$;

-- RPC para revertir conciliación
CREATE OR REPLACE FUNCTION public.unreconcile_tx_v1(
    p_tx_id UUID,
    p_metadata JSONB,
    p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_count INT;
BEGIN
    -- Security Check
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = auth.uid()
        AND organization_id = p_organization_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permisos insuficientes para esta organización');
    END IF;

    -- Update with elevated privileges
    UPDATE public.transacciones
    SET 
        estado = 'pendiente',
        comprobante_id = NULL,
        movimiento_id = NULL,
        monto_usado = 0,
        metadata = p_metadata
    WHERE id = p_tx_id
    AND organization_id = p_organization_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se encontró la transacción');
    END IF;

    RETURN jsonb_build_object('success', true, 'updated_id', p_tx_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.categorize_tx_v1(UUID, UUID, NUMERIC, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unreconcile_tx_v1(UUID, JSONB, UUID) TO authenticated;

COMMIT;
