-- Migration: Fix RLS policies for treasury tables
-- Date: 2026-02-24
-- Description: Fixes cross-org read vulnerability in aplicaciones_pago and instrumentos_pago RLS policies.

-- 1. Drop the broken policies
DROP POLICY IF EXISTS "Users can access applications of their org" ON public.aplicaciones_pago;
DROP POLICY IF EXISTS "Users can access instruments of their org" ON public.instrumentos_pago;

-- 2. Create proper policies with organization-scoped access via movimientos_tesoreria

-- aplicaciones_pago: SELECT
CREATE POLICY "View aplicaciones of own org" ON public.aplicaciones_pago
    FOR SELECT USING (
        movimiento_id IN (
            SELECT mt.id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id IN (
                SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
            )
        )
    );

-- aplicaciones_pago: INSERT
CREATE POLICY "Insert aplicaciones of own org" ON public.aplicaciones_pago
    FOR INSERT WITH CHECK (
        movimiento_id IN (
            SELECT mt.id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id IN (
                SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
            )
        )
    );

-- aplicaciones_pago: DELETE (for void operations)
CREATE POLICY "Delete aplicaciones of own org" ON public.aplicaciones_pago
    FOR DELETE USING (
        movimiento_id IN (
            SELECT mt.id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id IN (
                SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
            )
        )
    );

-- instrumentos_pago: SELECT
CREATE POLICY "View instrumentos of own org" ON public.instrumentos_pago
    FOR SELECT USING (
        movimiento_id IN (
            SELECT mt.id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id IN (
                SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
            )
        )
    );

-- instrumentos_pago: INSERT
CREATE POLICY "Insert instrumentos of own org" ON public.instrumentos_pago
    FOR INSERT WITH CHECK (
        movimiento_id IN (
            SELECT mt.id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id IN (
                SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
            )
        )
    );

-- instrumentos_pago: DELETE
CREATE POLICY "Delete instrumentos of own org" ON public.instrumentos_pago
    FOR DELETE USING (
        movimiento_id IN (
            SELECT mt.id FROM public.movimientos_tesoreria mt
            WHERE mt.organization_id IN (
                SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
            )
        )
    );

-- 3. Add UPDATE policy for movimientos_tesoreria (needed for soft-delete/void)
CREATE POLICY "Update treasury movements of own org" ON public.movimientos_tesoreria
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT user_id FROM organization_members WHERE organization_id = public.movimientos_tesoreria.organization_id
        )
    );

-- 4. Add DELETE policies for movimientos_tesoreria
CREATE POLICY "Delete treasury movements of own org" ON public.movimientos_tesoreria
    FOR DELETE USING (
        auth.uid() IN (
            SELECT user_id FROM organization_members WHERE organization_id = public.movimientos_tesoreria.organization_id
        )
    );
