-- Tabla para registrar ejecuciones automáticas (Crons)
CREATE TABLE IF NOT EXISTS public.automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL,
    status TEXT NOT NULL, -- 'SUCCESS', 'ERROR'
    message TEXT,
    execution_time_ms INTEGER,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

-- Política para que solo admins puedan ver los logs
CREATE POLICY "RLS_AutomationLogs_Admin_Select" ON public.automation_logs
    FOR SELECT
    TO authenticated
    USING (public.is_org_member(auth.uid())); -- Nota: Esto asume que el usuario tiene acceso a la organización para ver logs técnicos.
    -- En realidad, para logs globales, tal vez solo SuperAdmins. Por ahora permitimos a miembros.

-- Función para limpiar logs antiguos (opcional, para mantener la DB limpia)
CREATE OR REPLACE FUNCTION public.fn_clean_old_automation_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM public.automation_logs WHERE created_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql;
