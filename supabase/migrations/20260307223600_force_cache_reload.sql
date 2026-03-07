-- Migration: Force Schema Cache Reload (PGRST204 Fix)
-- Date: 2026-03-07
-- Description: Performs a dummy DDL change to force PostgREST to refresh its schema cache.

BEGIN;

-- 1. Ensure the column exists (Duplicate check for robustness)
ALTER TABLE public.archivos_importados 
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

-- 2. Force Cache Refresh (PGRST204)
-- Inserting/Dropping a dummy column is a proven way to force Supabase/PostgREST to re-map the schema.
ALTER TABLE public.archivos_importados ADD COLUMN IF NOT EXISTS temp_refresh_col_multibanco TEXT;
ALTER TABLE public.archivos_importados DROP COLUMN IF EXISTS temp_refresh_col_multibanco;

COMMIT;
