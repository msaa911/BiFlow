-- Migration: Fix missing Update policy for entidades
-- Date: 2026-02-23

CREATE POLICY "Update entidades" ON public.entidades 
FOR UPDATE USING (
    auth.uid() IN (
        SELECT user_id 
        FROM organization_members 
        WHERE organization_id = entidades.organization_id
    )
);
