const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://bnlmoupgzbtgfgominzd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
);

async function fixRLS() {
    console.log('--- STARTING RLS FIX ---');

    // We try to run raw SQL via the 'exec_sql' RPC if it exists, 
    // or just drop the table and recreate if nuclear? No, better to try SQL first.
    // If 'exec_sql' doesn't exist, we might need another way.

    const sql = `
        DO $$ 
        BEGIN
            -- Fix organization_members
            DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;
            DROP POLICY IF EXISTS "Users can view their own membership" ON organization_members;
            DROP POLICY IF EXISTS "Users can view fellow members" ON organization_members;
            
            CREATE POLICY "Users can view their own membership" 
            ON organization_members FOR SELECT 
            USING (auth.uid() = user_id);
            
            CREATE POLICY "Users can view fellow members" 
            ON organization_members FOR SELECT 
            USING (
                organization_id IN (
                    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
                )
            );

            -- Fix organizations
            DROP POLICY IF EXISTS "Users can view own organizations" ON organizations;
            CREATE POLICY "Users can view own organizations" 
            ON organizations FOR SELECT 
            USING (
                id IN (
                    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
                )
            );
        END $$;
    `;

    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error('Error applying RLS fix:', error);
        // If RPC fails, try common names one by one via direct methods if available 
        // (but Supabase JS doesn't have direct policy management)
    } else {
        console.log('RLS policies updated successfully!');
    }
}

fixRLS();
