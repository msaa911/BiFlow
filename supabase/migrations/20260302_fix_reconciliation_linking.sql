-- Migration: Add missing linking column for Reconciliation Engine
-- Date: 2026-03-02
-- Description: Adds movimiento_id to transacciones table to link bank records with treasury movements.

-- 1. Add the column
ALTER TABLE public.transacciones
ADD COLUMN IF NOT EXISTS movimiento_id uuid REFERENCES public.movimientos_tesoreria(id) ON DELETE SET NULL;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_transacciones_movimiento_id ON public.transacciones(movimiento_id);

-- 3. Ensure 'parcial' state is allowed (safety check from previous migration)
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
