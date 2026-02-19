
-- Migration: Upgrade Company (Organization) Configuration
-- Adds liquidity cushion and rate mode for Opportunity Cost calculations.

ALTER TABLE public.configuracion_empresa 
ADD COLUMN IF NOT EXISTS colchon_liquidez NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS modo_tasa TEXT DEFAULT 'AUTOMATICO' CHECK (modo_tasa IN ('AUTOMATICO', 'MANUAL'));

COMMENT ON COLUMN public.configuracion_empresa.colchon_liquidez IS 'Dinero que la empresa desea mantener líquido (no se considera para costo de oportunidad)';
COMMENT ON COLUMN public.configuracion_empresa.modo_tasa IS 'Define si se usa la tasa de mercado (indices_mercado) o la tasa manual (tna)';
