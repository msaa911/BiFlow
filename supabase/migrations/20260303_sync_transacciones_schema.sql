-- Migration: Sync Transacciones Schema with Categorization
-- Date: 2026-03-03
-- Description: Adds 'categoria' column to transacciones to support direct impact from bank statements.

-- 1. Add 'categoria' column to transacciones
ALTER TABLE public.transacciones 
ADD COLUMN IF NOT EXISTS categoria text;

-- 2. Add comment for the schema cache and developers
COMMENT ON COLUMN public.transacciones.categoria IS 'Concepto principal de categorización directa desde el extracto bancario.';

-- 3. Index for performance on categorization filters
CREATE INDEX IF NOT EXISTS idx_transacciones_categoria ON public.transacciones(categoria);
