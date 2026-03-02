-- Migration: Support Partial Bank Reconciliations
-- Date: 2026-03-01
-- Description: Adds monto_usado to transacciones and allows 'parcial' state.

-- 1. Add monto_usado tracking column
ALTER TABLE public.transacciones 
ADD COLUMN IF NOT EXISTS monto_usado numeric(12,2) NOT NULL DEFAULT 0;

-- 2. Update the CHECK constraint on estado to allow 'parcial'
-- First we have to drop the existing constraint. Since we don't know its exact name, 
-- we use a DO block to find and drop it, then add the new one.
DO $$ 
DECLARE
    constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.transacciones'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%estado%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.transacciones DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

ALTER TABLE public.transacciones 
ADD CONSTRAINT transacciones_estado_check 
CHECK (estado IN ('pendiente', 'conciliado', 'anulado', 'parcial'));
