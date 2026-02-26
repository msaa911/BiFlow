-- Migration: Fix three critical issues with Treasury imports and import history
-- Date: 2026-02-26

-- ISSUE 1: entidad_id NOT NULL constraint prevents saving movements when entity resolution fails
ALTER TABLE public.movimientos_tesoreria ALTER COLUMN entidad_id DROP NOT NULL;

-- ISSUE 2: Missing DELETE policy on archivos_importados prevents users from deleting import history
DROP POLICY IF EXISTS "Users can delete their own import logs" ON public.archivos_importados;
CREATE POLICY "Users can delete their own import logs"
  ON public.archivos_importados FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.organization_members
      WHERE organization_id = archivos_importados.organization_id
    )
  );

-- ISSUE 3: Missing DELETE policy on transacciones (needed for cascading delete of bank transactions)
DROP POLICY IF EXISTS "Users can delete transactions of own org" ON public.transacciones;
CREATE POLICY "Users can delete transactions of own org"
  ON public.transacciones FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.organization_members
      WHERE organization_id = transacciones.organization_id
    )
  );

-- ISSUE 4: Missing DELETE policy on transacciones_revision (quarantine)
DROP POLICY IF EXISTS "Users can delete quarantine items of own org" ON public.transacciones_revision;
CREATE POLICY "Users can delete quarantine items of own org"
  ON public.transacciones_revision FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.organization_members
      WHERE organization_id = transacciones_revision.organization_id
    )
  );

-- ISSUE 5: Missing DELETE policy on comprobantes
DROP POLICY IF EXISTS "Users can delete comprobantes of own org" ON public.comprobantes;
CREATE POLICY "Users can delete comprobantes of own org"
  ON public.comprobantes FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.organization_members
      WHERE organization_id = comprobantes.organization_id
    )
  );
