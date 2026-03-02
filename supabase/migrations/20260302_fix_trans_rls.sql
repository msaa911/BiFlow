-- Enable RLS (just in case)
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;

-- Add UPDATE policy for transacciones
-- Allowing users to update transactions of their own organization
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'transacciones' 
        AND policyname = 'Users can update transactions of their own organization'
    ) THEN
        CREATE POLICY "Users can update transactions of their own organization"
        ON transacciones
        FOR UPDATE
        TO authenticated
        USING (organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        ))
        WITH CHECK (organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        ));
    END IF;
END
$$;

-- Also ensure SELECT policy exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'transacciones' 
        AND policyname = 'Users can view transactions of their own organization'
    ) THEN
        CREATE POLICY "Users can view transactions of their own organization"
        ON transacciones
        FOR SELECT
        TO authenticated
        USING (organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        ));
    END IF;
END
$$;
