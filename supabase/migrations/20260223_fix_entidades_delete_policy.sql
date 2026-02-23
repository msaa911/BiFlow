-- Add DELETE policy for entidades table
-- This allows users to delete clients/suppliers from their own organization

CREATE POLICY "Delete entidades" ON public.entidades
    FOR DELETE
    TO authenticated
    USING (
        auth.uid() IN (
            SELECT user_id 
            FROM organization_members 
            WHERE organization_id = entidades.organization_id
        )
    );
