-- Migration: Add updated_at to comprobantes
-- Description: Fixes reconciliation engine error when updating invoices.
-- Date: 2026-03-30

BEGIN;

-- 1. Add column with default now()
ALTER TABLE public.comprobantes 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- 2. Initial synchronization for existing records
UPDATE public.comprobantes 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- 3. Trigger for automatic updates
-- Note: Reuses the existing 'update_updated_at_column' procedure from the transacciones migration
DROP TRIGGER IF EXISTS update_comprobantes_updated_at ON public.comprobantes;
CREATE TRIGGER update_comprobantes_updated_at
    BEFORE UPDATE ON public.comprobantes
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

COMMIT;
