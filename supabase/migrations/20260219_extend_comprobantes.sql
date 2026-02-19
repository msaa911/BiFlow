
-- Migration: Extend Comprobantes for Treasury Hub
-- Date: 2026-02-19

-- 1. Add Bank and Entity columns
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS cuit_socio_original text; -- Backup for Cuil/Cuit raw
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- 2. Add description if missing (sometimes used for concept fallback)
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS descripcion text;

-- 3. Add index for bank-based filtering
CREATE INDEX IF NOT EXISTS idx_comprobantes_banco ON public.comprobantes(organization_id, banco);
