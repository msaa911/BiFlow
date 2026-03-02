
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
