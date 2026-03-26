-- ==========================================================
-- SPRINT 8: INFRAESTRUCTURA DE MONITOREO Y AUDITORÍA (FASE 4)
-- ==========================================================
-- Descripción: Creación de la tabla de logs de auditoría centralizada
-- para el panel de administración.

BEGIN;

-- 1. CREACIÓN DE LA TABLA DE AUDIT_LOGS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    category TEXT NOT NULL CHECK (category IN ('auth', 'payments', 'system', 'admin')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL
);

-- Habilitar RLS en audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. POLÍTICAS RLS (SOLO ADMINS)
-- ----------------------------------------------------------
-- Solo los administradores pueden ver los logs globales.
-- Nadie (ni siquiera administradores) debería poder EDITAR o BORRAR logs de auditoría
-- por integridad del registro (solo lectura por diseño).

CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    );

-- Permitir la inserción de logs desde el sistema (vía Supabase Client con Service Role o via RPC/Triggers)
-- Para que el cliente de Supabase regular pueda insertar (si se desea loggear desde cliente),
-- necesitaríamos una política de INSERT. Pero preferimos hacerlo vía Server Actions (Service Role) 
-- o Triggers para asegurar integridad.
-- No obstante, añadimos política de INSERT restringida para facilitar el registro desde el backend logic.

CREATE POLICY "System can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    );

-- 3. VISTAS AUXILIARES PARA EL DASHBOARD
-- ----------------------------------------------------------

-- Vista para errores críticos de las últimas 24 horas
CREATE OR REPLACE VIEW public.vw_critical_errors_24h AS
SELECT * 
FROM public.audit_logs
WHERE level = 'error' 
AND created_at >= now() - interval '24 hours';

-- Vista para actividad sospechosa (ej. múltiples fallos de login en corto intervalo)
-- NOTA: Esto es conceptual, depende de cómo se logueen los eventos de auth.
CREATE OR REPLACE VIEW public.vw_suspicious_activity AS
SELECT * 
FROM public.audit_logs
WHERE category = 'auth' 
AND level IN ('warn', 'error')
AND created_at >= now() - interval '1 hour';

-- 4. ÍNDICES DE RENDIMIENTO
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_level ON public.audit_logs(level);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON public.audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

COMMIT;
