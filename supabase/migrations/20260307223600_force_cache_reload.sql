-- Migration: Force Schema Cache Reload (PGRST204 Fix)
-- Date: 2026-03-07
-- Description: Performs a dummy DDL change to force PostgREST to refresh its schema cache.

BEGIN;

-- 1. Ensure the column exists (Duplicate check for robustness)
ALTER TABLE public.archivos_importados 
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

-- 2. Force Cache Refresh (PGRST204)
-- We do this for all affected tables
ALTER TABLE public.archivos_importados ADD COLUMN IF NOT EXISTS temp_refresh_col TEXT;
ALTER TABLE public.archivos_importados DROP COLUMN IF EXISTS temp_refresh_col;

ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS temp_refresh_col TEXT;
ALTER TABLE public.transacciones DROP COLUMN IF EXISTS temp_refresh_col;

ALTER TABLE public.movimientos_tesoreria ADD COLUMN IF NOT EXISTS temp_refresh_col TEXT;
ALTER TABLE public.movimientos_tesoreria DROP COLUMN IF EXISTS temp_refresh_col;

ALTER TABLE public.instrumentos_pago ADD COLUMN IF NOT EXISTS temp_refresh_col TEXT;
ALTER TABLE public.instrumentos_pago DROP COLUMN IF EXISTS temp_refresh_col;

COMMIT;
