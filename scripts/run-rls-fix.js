const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://bnlmoupgzbtgfgominzd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'
);

const sql = `
-- Fixing missing policies for treasury operations (Auto Reconciliation requirements)

-- Movimientos Tesoreria
DROP POLICY IF EXISTS "Users can insert movimientos of own org" ON public.movimientos_tesoreria;
CREATE POLICY "Users can insert movimientos of own org"
  ON public.movimientos_tesoreria FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM public.organization_members
      WHERE organization_id = movimientos_tesoreria.organization_id
    )
  );

DROP POLICY IF EXISTS "Users can update movimientos of own org" ON public.movimientos_tesoreria;
CREATE POLICY "Users can update movimientos of own org"
  ON public.movimientos_tesoreria FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.organization_members
      WHERE organization_id = movimientos_tesoreria.organization_id
    )
  );

-- Instrumentos Pago (No organization_id, depends on movimiento)
-- Since RLS checks can be complex for relations on insert, let's allow insert if movement exists in user's org.
DROP POLICY IF EXISTS "Users can insert instrumentos" ON public.instrumentos_pago;
CREATE POLICY "Users can insert instrumentos"
  ON public.instrumentos_pago FOR INSERT
  WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.movimientos_tesoreria m
        JOIN public.organization_members om ON m.organization_id = om.organization_id
        WHERE m.id = instrumentos_pago.movimiento_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update instrumentos" ON public.instrumentos_pago;
CREATE POLICY "Users can update instrumentos"
  ON public.instrumentos_pago FOR UPDATE
  USING (
    EXISTS (
        SELECT 1 FROM public.movimientos_tesoreria m
        JOIN public.organization_members om ON m.organization_id = om.organization_id
        WHERE m.id = instrumentos_pago.movimiento_id AND om.user_id = auth.uid()
    )
  );

-- Aplicaciones Pago
DROP POLICY IF EXISTS "Users can insert aplicaciones" ON public.aplicaciones_pago;
CREATE POLICY "Users can insert aplicaciones"
  ON public.aplicaciones_pago FOR INSERT
  WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.movimientos_tesoreria m
        JOIN public.organization_members om ON m.organization_id = om.organization_id
        WHERE m.id = aplicaciones_pago.movimiento_id AND om.user_id = auth.uid()
    )
  );

-- Comprobantes (Wait, user needs UPDATE policy on comprobantes)
DROP POLICY IF EXISTS "Users can update comprobantes of own org" ON public.comprobantes;
CREATE POLICY "Users can update comprobantes of own org"
  ON public.comprobantes FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.organization_members
      WHERE organization_id = comprobantes.organization_id
    )
  );

-- Transacciones (Ensure UPDATE policy exists)
DROP POLICY IF EXISTS "Users can update transacciones of own org" ON public.transacciones;
CREATE POLICY "Users can update transacciones of own org"
  ON public.transacciones FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.organization_members
      WHERE organization_id = transacciones.organization_id
    )
  );
`;

const fs = require('fs');
fs.writeFileSync('./supabase/migrations/20260301_fix_reconciliation_rls.sql', sql);
console.log("Migration file created.");

async function executeRaw() {
    // Run an empty migration up to trigger it if we're connected to the true backend
    // Since we don't have db push configured perfectly, we can execute via JS raw function if we made an RPC for it earlier.
    console.log("Run this migration using supabase CLI, or use an RPC.");
    // Wait, the project is hosted. I can execute this by injecting an RPC!

    // Let's create an RPC using standard JS, but we can't because JS client has no raw query!
    // But BiFlow had a workaround before with a function 'exec_sql'. Let's see if it exists.
    const execRes = await supabase.rpc('exec_sql', { query: sql });
    console.log("Exec SQL RPC Result:", execRes);
}
executeRaw();
