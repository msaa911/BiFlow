-- Migration: Advanced Invoicing (v3.0)
-- Date: 2026-02-23

-- 1. Extend COMPROBANTES with advanced business logic
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS condicion text CHECK (condicion IN ('contado', 'cuenta_corriente')) DEFAULT 'cuenta_corriente';
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS metodo_pago text;
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS concepto text;

-- 2. Update existing records to default 'cuenta_corriente' for safety
UPDATE public.comprobantes SET condicion = 'cuenta_corriente' WHERE condicion IS NULL;

-- 3. Add index for better filtering by payment condition
CREATE INDEX IF NOT EXISTS idx_comprobantes_condicion ON public.comprobantes(organization_id, condicion);
