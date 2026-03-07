-- Migration to support multiple bank rates in market indices
-- Created: 2026-03-06

-- 1. Add jsonb column to store all bank rates for a specific date
ALTER TABLE public.indices_mercado ADD COLUMN IF NOT EXISTS tasas_bancos JSONB DEFAULT '{}';

-- 2. Update configuracion_empresa to allow free-text bank names in tasa_referencia_auto
-- First, remove the previous check constraint if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'configuracion_empresa_tasa_referencia_auto_check') THEN
        ALTER TABLE public.configuracion_empresa DROP CONSTRAINT configuracion_empresa_tasa_referencia_auto_check;
    END IF;
END $$;

-- 3. The column tasa_referencia_auto already exists from previous migration, but we ensure it's TEXT
ALTER TABLE public.configuracion_empresa ALTER COLUMN tasa_referencia_auto SET DEFAULT 'PLAZO_FIJO';

COMMENT ON COLUMN public.indices_mercado.tasas_bancos IS 'Mapa de tasas por entidad (ej: {"BANCO NACION": 0.25, ...})';
