-- Final Multibanco Schema Repair & Cache Refresh
-- Date: 2026-03-07
-- Description: Ensures cuenta_id exists in all relevant tables and forces PostgREST refresh.

BEGIN;

-- 1. Create Column in Transacciones (CRITICAL)
ALTER TABLE public.transacciones 
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

-- 2. Create Column in Treasury Tables
ALTER TABLE public.movimientos_tesoreria 
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

ALTER TABLE public.instrumentos_pago 
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

-- 3. Ensure column in Audit Table
ALTER TABLE public.archivos_importados 
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

-- 4. Force Schema Cache Refresh (DDL "Twist")
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS temp_refresh_col TEXT;
ALTER TABLE public.transacciones DROP COLUMN IF EXISTS temp_refresh_col;

ALTER TABLE public.movimientos_tesoreria ADD COLUMN IF NOT EXISTS temp_refresh_col TEXT;
ALTER TABLE public.movimientos_tesoreria DROP COLUMN IF EXISTS temp_refresh_col;

ALTER TABLE public.instrumentos_pago ADD COLUMN IF NOT EXISTS temp_refresh_col TEXT;
ALTER TABLE public.instrumentos_pago DROP COLUMN IF EXISTS temp_refresh_col;

ALTER TABLE public.archivos_importados ADD COLUMN IF NOT EXISTS temp_refresh_col TEXT;
ALTER TABLE public.archivos_importados DROP COLUMN IF EXISTS temp_refresh_col;

COMMIT;
