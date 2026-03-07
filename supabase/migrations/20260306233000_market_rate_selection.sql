-- Migration to support selection of market rate type
-- Created: 2026-03-06

ALTER TABLE public.configuracion_empresa ADD COLUMN IF NOT EXISTS tasa_referencia_auto TEXT DEFAULT 'PLAZO_FIJO' CHECK (tasa_referencia_auto IN ('PLAZO_FIJO', 'BADLAR'));

COMMENT ON COLUMN public.configuracion_empresa.tasa_referencia_auto IS 'Define qué índice de mercado se usa en modo AUTOMATICO (PLAZO_FIJO o BADLAR)';
