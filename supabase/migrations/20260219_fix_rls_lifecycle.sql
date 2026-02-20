
-- Migration: Fix RLS Lifecycle (DELETE/UPDATE) & Memberships Ref
-- Date: 2026-02-19

-- 1. Fix Table Reference in configuracion_impuestos
-- It was using 'memberships' which doesn't exist (should be organization_members)
DROP POLICY IF EXISTS "Users can view tax config for their org" ON public.configuracion_impuestos;
DROP POLICY IF EXISTS "Users can insert tax config for their org" ON public.configuracion_impuestos;
DROP POLICY IF EXISTS "Users can update tax config for their org" ON public.configuracion_impuestos;

CREATE POLICY "Users can view tax config for their org" ON public.configuracion_impuestos
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.organization_members WHERE organization_id = configuracion_impuestos.organization_id));

CREATE POLICY "Users can insert tax config for their org" ON public.configuracion_impuestos
    FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM public.organization_members WHERE organization_id = configuracion_impuestos.organization_id));

CREATE POLICY "Users can update tax config for their org" ON public.configuracion_impuestos
    FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM public.organization_members WHERE organization_id = configuracion_impuestos.organization_id));

CREATE POLICY "Users can delete tax config for their org" ON public.configuracion_impuestos
    FOR DELETE USING (auth.uid() IN (SELECT user_id FROM public.organization_members WHERE organization_id = configuracion_impuestos.organization_id));


-- 2. Add Missing Policies for COMPROBANTES
DROP POLICY IF EXISTS "Update comprobantes" ON public.comprobantes;
DROP POLICY IF EXISTS "Delete comprobantes" ON public.comprobantes;

CREATE POLICY "Update comprobantes" ON public.comprobantes 
    FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = comprobantes.organization_id));

CREATE POLICY "Delete comprobantes" ON public.comprobantes 
    FOR DELETE USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = comprobantes.organization_id));


-- 3. Add Missing Policies for PAGOS_PROYECTADOS
DROP POLICY IF EXISTS "Update pagos_proyectados" ON public.pagos_proyectados;
DROP POLICY IF EXISTS "Delete pagos_proyectados" ON public.pagos_proyectados;

CREATE POLICY "Update pagos_proyectados" ON public.pagos_proyectados 
    FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = pagos_proyectados.organization_id));

CREATE POLICY "Delete pagos_proyectados" ON public.pagos_proyectados 
    FOR DELETE USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = pagos_proyectados.organization_id));


-- 4. Ensure TRANSACCIONES has full lifecycle
DROP POLICY IF EXISTS "Delete transacciones" ON public.transacciones;
DROP POLICY IF EXISTS "Update transacciones" ON public.transacciones;

CREATE POLICY "Delete transacciones" ON public.transacciones 
    FOR DELETE USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = transacciones.organization_id));

CREATE POLICY "Update transacciones" ON public.transacciones 
    FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = transacciones.organization_id));
