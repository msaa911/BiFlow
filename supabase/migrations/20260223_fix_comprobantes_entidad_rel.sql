-- Migration: Fix Comprobantes Entidad Relationship
-- Date: 2026-02-23

-- 1. Add entidad_id column to comprobantes
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS entidad_id UUID REFERENCES public.entidades(id) ON DELETE SET NULL;

-- 2. Link existing records to entidades based on CUIT (Best effort migration)
DO $$ 
BEGIN
    UPDATE public.comprobantes c
    SET entidad_id = e.id
    FROM public.entidades e
    WHERE c.cuit_socio = e.cuit 
      AND c.organization_id = e.organization_id
      AND c.entidad_id IS NULL;
END $$;

-- 3. Add index for performance in relational queries
CREATE INDEX IF NOT EXISTS idx_comprobantes_entidad_id ON public.comprobantes(organization_id, entidad_id);
