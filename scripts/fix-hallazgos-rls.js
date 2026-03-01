const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://bnlmoupgzbtgfgominzd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
);

async function fixRLS() {
    const sql = `
        DO $$ 
        BEGIN
            DROP POLICY IF EXISTS "Usuarios pueden ver sus hallazgos" ON public.hallazgos_auditoria;
            
            CREATE POLICY "Users can view own findings" 
            ON public.hallazgos_auditoria FOR SELECT 
            USING (
                organization_id IN (
                    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
                )
            );
        END $$;
    `;

    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error('Error applying RLS fix for hallazgos_auditoria:', error);
    } else {
        console.log('RLS policies updated successfully for hallazgos_auditoria!');
    }
}

fixRLS();
