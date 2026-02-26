-- Migration: Fix Treasury RLS Policies (SELECT and INSERT)
-- Date: 2026-02-26

-- 1. Drop the broken policies that reference the non-existent 'organization_users' table
DROP POLICY IF EXISTS "Users can view treasury movements of their org" ON public.movimientos_tesoreria;
DROP POLICY IF EXISTS "Users can insert treasury movements of their org" ON public.movimientos_tesoreria;

-- 2. Create the correct policies using 'organization_members'
CREATE POLICY "Users can view treasury movements of their org" ON public.movimientos_tesoreria
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM public.organization_members WHERE organization_id = public.movimientos_tesoreria.organization_id
        )
    );

CREATE POLICY "Users can insert treasury movements of their org" ON public.movimientos_tesoreria
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM public.organization_members WHERE organization_id = public.movimientos_tesoreria.organization_id
        )
    );
