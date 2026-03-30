-- Migration: Add updated_at to transacciones
-- Description: Solves reconciliation engine error by adding missing audit column.
-- Author: BiFlow Agent

BEGIN;

-- 1. Add column with default now()
ALTER TABLE public.transacciones 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- 2. Update existing rows to match created_at for consistency
UPDATE public.transacciones SET updated_at = created_at WHERE updated_at IS NULL;

-- 3. Dynamic trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Apply trigger to transacciones
DROP TRIGGER IF EXISTS update_transacciones_updated_at ON public.transacciones;
CREATE TRIGGER update_transacciones_updated_at
    BEFORE UPDATE ON public.transacciones
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

COMMIT;
