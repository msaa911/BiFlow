-- ==========================================================
-- SPRINT 8: INFRAESTRUCTURA DE DATOS Y RBAC (FASE 1)
-- ==========================================================
-- Descripción: Implementación de perfiles globales, roles de administrador
-- y actualización de políticas RLS para permitir "Modo Dios".

BEGIN;

-- 1. CREACIÓN DE LA TABLA DE PERFILES
-- ----------------------------------------------------------
-- Esta tabla almacena información global del usuario y su rol en la plataforma.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('superadmin', 'admin', 'user')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    );

-- 2. FUNCIONES DE SEGURIDAD (RBAC)
-- ----------------------------------------------------------

-- Función para verificar si el usuario es administrador global
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para verificar si el usuario es superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'superadmin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. TRIGGER DE CREACIÓN AUTOMÁTICA DE PERFIL
-- ----------------------------------------------------------
-- Garantiza que cada nuevo usuario de Auth tenga un perfil en 'public'.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name', 
    NEW.raw_user_meta_data->>'avatar_url',
    'user' -- Rol por defecto
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para el registro
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. ACTUALIZACIÓN DE POLÍTICAS RLS (MODO DIOS)
-- ----------------------------------------------------------
-- Permitimos que los administradores vean y gestionen datos de cualquier organización.

-- 4.1 Organizations
DROP POLICY IF EXISTS "Users can view own organizations" ON public.organizations;
CREATE POLICY "RLS_Organizations_Select_Admin" ON public.organizations
    FOR SELECT USING (
        public.is_org_member(id) OR public.is_admin()
    );

-- 4.2 Organization Members
DROP POLICY IF EXISTS "Users can view members of their organizations" ON public.organization_members;
CREATE POLICY "RLS_OrgMembers_Select_Admin" ON public.organization_members
    FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
        OR public.is_admin()
    );

-- 4.3 Transacciones
DROP POLICY IF EXISTS "RLS_Transacciones_Select" ON public.transacciones;
CREATE POLICY "RLS_Transacciones_Select_Admin" ON public.transacciones
    FOR SELECT USING (
        public.is_org_member(organization_id) OR public.is_admin()
    );

DROP POLICY IF EXISTS "RLS_Transacciones_Insert" ON public.transacciones;
CREATE POLICY "RLS_Transacciones_Insert_Admin" ON public.transacciones
    FOR INSERT WITH CHECK (
        public.is_org_member(organization_id) OR public.is_admin()
    );

-- 4.4 Comprobantes (Invoices)
DROP POLICY IF EXISTS "View comprobantes" ON public.comprobantes;
CREATE POLICY "RLS_Comprobantes_Select_Admin" ON public.comprobantes
    FOR SELECT USING (
        public.is_org_member(organization_id) OR public.is_admin()
    );

-- 4.5 Cuentas Bancarias
DROP POLICY IF EXISTS "Users can manage their org accounts" ON public.cuentas_bancarias;
CREATE POLICY "RLS_Cuentas_Select_Admin" ON public.cuentas_bancarias
    FOR SELECT USING (
        public.is_org_member(organization_id) OR public.is_admin()
    );

-- 4.6 Hallazgos (AI Findings)
DROP POLICY IF EXISTS "View findings" ON public.hallazgos;
CREATE POLICY "RLS_Hallazgos_Select_Admin" ON public.hallazgos
    FOR SELECT USING (
        public.is_org_member(organization_id) OR public.is_admin()
    );

-- 4.7 Processing Logs
DROP POLICY IF EXISTS "View logs" ON public.processing_logs;
CREATE POLICY "RLS_Logs_Select_Admin" ON public.processing_logs
    FOR SELECT USING (
        public.is_org_member(organization_id) OR public.is_admin()
    );

-- 4.8 Notificaciones
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notificaciones;
CREATE POLICY "RLS_Notificaciones_Select_Admin" ON public.notificaciones
    FOR SELECT USING (
        user_id = auth.uid() OR public.is_admin()
    );

-- 5. MIGRACIÓN DE USUARIOS EXISTENTES
-- ----------------------------------------------------------
-- Insertamos perfiles para los usuarios que ya existen en auth.users
INSERT INTO public.profiles (id, full_name, role)
SELECT id, raw_user_meta_data->>'full_name', 'user'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- [NOTA PARA EL USUARIO]: 
-- Después de ejecutar este script, recuerda asignar el rol de 'superadmin' 
-- a tu propia cuenta mediante SQL:
-- UPDATE public.profiles SET role = 'superadmin' WHERE id = 'TU-UUID-AQUI';
