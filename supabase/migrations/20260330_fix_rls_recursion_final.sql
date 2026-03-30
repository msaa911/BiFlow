-- ============================================================
-- MIGRACIÓN: CORRECCIÓN DE RECURSIÓN RLS EN ORGANIZATION_MEMBERS
-- Descripción: Reemplaza políticas recursivas que causan bucles infinitos
--              en consultas SELECT, utilizando la función SECURITY DEFINER
--              public.is_org_member(uuid).
-- ============================================================

BEGIN;

-- 1. ASEGURAR QUE LA FUNCIÓN is_org_member SEA SEGURA (SECURITY DEFINER)
-- ----------------------------------------------------------
-- Ya existe, pero la reforzamos para garantizar que se ejecute con privilegios de owner
-- y evite el chequeo de RLS en la propia tabla organization_members.
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = auth.uid()
    AND organization_id = org_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. CORREGIR POLÍTICA EN organization_members
-- ----------------------------------------------------------
-- Eliminamos la política que causaba recursión (subquery a la misma tabla)
DROP POLICY IF EXISTS "RLS_OrgMembers_Select_Admin" ON public.organization_members;

-- Nueva política no-recursiva para SELECT
CREATE POLICY "RLS_OrgMembers_Select_Safe" ON public.organization_members
    FOR SELECT USING (
        public.is_org_member(organization_id)
        OR public.is_admin()
    );

-- 3. CORREGIR POLÍTICAS EN configuracion_empresa
-- ----------------------------------------------------------
-- Reemplazamos las políticas que gatillaban la recursión indirecta
-- utilizando ahora la función segura is_org_member.

DROP POLICY IF EXISTS "Users can view own org config" ON public.configuracion_empresa;
CREATE POLICY "RLS_ConfigEmpresa_Select" ON public.configuracion_empresa
    FOR SELECT USING (
        public.is_org_member(organization_id) OR public.is_admin()
    );

DROP POLICY IF EXISTS "Users can update own org config" ON public.configuracion_empresa;
CREATE POLICY "RLS_ConfigEmpresa_Update" ON public.configuracion_empresa
    FOR UPDATE USING (
        public.is_org_member(organization_id) OR public.is_admin()
    );

DROP POLICY IF EXISTS "Users can insert own org config" ON public.configuracion_empresa;
CREATE POLICY "RLS_ConfigEmpresa_Insert" ON public.configuracion_empresa
    FOR INSERT WITH CHECK (
        public.is_org_member(organization_id) OR public.is_admin()
    );

COMMIT;

-- [RESUMEN]: Se eliminó el bucle infinito al desacoplar el chequeo de 
-- pertenencia mediante una función SECURITY DEFINER.
