-- Migration: Fix Treasury RLS and Organization Link
-- Date: 2026-02-23
-- Description: Ensures all treasury tables have organization_id for proper RLS filtering and fixes insert policies.

-- 1. Add organization_id to sub-tables (useful for direct filtering later)
ALTER TABLE public.aplicaciones_pago ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.instrumentos_pago ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- 2. Update existing records if any
UPDATE public.aplicaciones_pago ap
SET organization_id = mt.organization_id
FROM public.movimientos_tesoreria mt
WHERE ap.movimiento_id = mt.id AND ap.organization_id IS NULL;

UPDATE public.instrumentos_pago ip
SET organization_id = mt.organization_id
FROM public.movimientos_tesoreria mt
WHERE ip.movimiento_id = mt.id AND ip.organization_id IS NULL;

-- 3. Fix RLS Policies for MOVIMIENTOS
DROP POLICY IF EXISTS "Users can insert treasury movements of their org" ON public.movimientos_tesoreria;
CREATE POLICY "Users can insert treasury movements" ON public.movimientos_tesoreria
    FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM organization_users WHERE organization_id = organization_id));

-- 4. Fix RLS Policies for APLICACIONES (All-in-one policy for simplicity and reliability)
DROP POLICY IF EXISTS "Users can access applications of their org" ON public.aplicaciones_pago;
CREATE POLICY "Users can manage applications" ON public.aplicaciones_pago
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM organization_users WHERE organization_id = (SELECT organization_id FROM public.movimientos_tesoreria WHERE id = movimiento_id))
    );

-- 5. Fix RLS Policies for INSTRUMENTOS
DROP POLICY IF EXISTS "Users can access instruments of their org" ON public.instrumentos_pago;
CREATE POLICY "Users can manage instruments" ON public.instrumentos_pago
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM organization_users WHERE organization_id = (SELECT organization_id FROM public.movimientos_tesoreria WHERE id = movimiento_id))
    );
