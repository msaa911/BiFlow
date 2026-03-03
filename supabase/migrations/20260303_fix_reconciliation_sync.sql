-- Migration: Fix Reconciliation Sync and RLS
-- Date: 2026-03-03
-- Description: Allow 'parcial' state and ensure UPDATE policy is robust for browser clients.

-- 1. Update CHECK constraint to allow 'parcial'
ALTER TABLE public.transacciones 
DROP CONSTRAINT IF EXISTS transacciones_estado_check;

ALTER TABLE public.transacciones
ADD CONSTRAINT transacciones_estado_check 
CHECK (estado IN ('pendiente', 'conciliado', 'parcial', 'anulado'));

-- 2. Consolidate UPDATE Policy with explicit check
DROP POLICY IF EXISTS "Users can update transactions of their own organization" ON public.transacciones;
DROP POLICY IF EXISTS "Users can update transacciones of own org" ON public.transacciones;

CREATE POLICY "Allow members to update transacciones"
ON public.transacciones
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

-- 3. Repair orphaned transactions
-- Update any transaction that has a movement but is still marked as 'pendiente'
UPDATE public.transacciones
SET estado = 'conciliado'
WHERE movimiento_id IS NOT NULL 
AND estado = 'pendiente';
