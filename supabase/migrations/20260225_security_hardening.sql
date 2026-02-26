-- ============================================================
-- Migration: Security Hardening
-- Fecha: 2026-02-25
-- Descripción: Resolución de 23 hallazgos de la auditoría de 
--              seguridad de Supabase.
-- ============================================================

-- ============================================================
-- 1. HABILITAR RLS EN TABLAS QUE TIENEN POLÍTICAS PERO RLS OFF
-- ============================================================

-- 1a. perfiles (tiene políticas pero RLS deshabilitado)
ALTER TABLE IF EXISTS public.perfiles ENABLE ROW LEVEL SECURITY;

-- 1b. archivos_importados (tiene políticas pero RLS deshabilitado)
ALTER TABLE IF EXISTS public.archivos_importados ENABLE ROW LEVEL SECURITY;

-- 1c. error_logs (tiene políticas pero RLS deshabilitado)
ALTER TABLE IF EXISTS public.error_logs ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. FIJAR search_path EN FUNCIONES VULNERABLES
--    Previene ataques de inyección por search_path mutable
-- ============================================================

-- 2a. get_next_treasury_number
CREATE OR REPLACE FUNCTION public.get_next_treasury_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    prefix TEXT;
BEGIN
    SELECT COALESCE(MAX(numero_correlativo), 0) + 1 INTO next_num
    FROM public.movimientos_tesoreria
    WHERE organization_id = NEW.organization_id AND tipo = NEW.tipo;

    NEW.numero_correlativo := next_num;
    
    prefix := CASE WHEN NEW.tipo = 'cobro' THEN 'RC' ELSE 'OP' END;
    NEW.numero := prefix || '-' || LPAD(next_num::text, 6, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- 2b. update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- 2c. is_org_member
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


-- 2d. create_new_organization
CREATE OR REPLACE FUNCTION public.create_new_organization(org_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.organizations (name, tier)
  VALUES (org_name, 'free')
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, current_user_id, 'owner');

  RETURN new_org_id;
END;
$$;


-- 2e. immutable_unaccent
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text AS $$
    SELECT public.unaccent('public.unaccent', $1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path = public;


-- ============================================================
-- 3. VISTA view_metrics_hallazgos → SECURITY INVOKER
--    Elimina escalación de privilegios al ejecutar como el
--    usuario que consulta, no como el owner de la vista.
-- ============================================================

DROP VIEW IF EXISTS public.view_metrics_hallazgos;

CREATE VIEW public.view_metrics_hallazgos
WITH (security_invoker = true)
AS
SELECT 
    organization_id,
    severidad,
    COUNT(*) AS cantidad,
    SUM(COALESCE(monto_estimado_recupero, 0)) AS total_recuperable
FROM public.hallazgos
GROUP BY organization_id, severidad;


-- ============================================================
-- 4. REEMPLAZAR POLÍTICAS PERMISIVAS (USING (true))
-- ============================================================

-- 4a. convenios_bancarios: Reemplazar "Lectura convenios" (FOR ALL, USING true)
DROP POLICY IF EXISTS "Lectura convenios" ON public.convenios_bancarios;
DROP POLICY IF EXISTS "Usuarios pueden gestionar sus convenios" ON public.convenios_bancarios;

CREATE POLICY "Usuarios pueden ver sus convenios"
ON public.convenios_bancarios
FOR SELECT
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios pueden insertar convenios"
ON public.convenios_bancarios
FOR INSERT
WITH CHECK (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios pueden actualizar convenios"
ON public.convenios_bancarios
FOR UPDATE
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios pueden eliminar convenios"
ON public.convenios_bancarios
FOR DELETE
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);


-- 4b. hallazgos_auditoria: Reemplazar "Lectura hallazgos" (FOR ALL, USING true)
DROP POLICY IF EXISTS "Lectura hallazgos" ON public.hallazgos_auditoria;
DROP POLICY IF EXISTS "Usuarios pueden ver sus hallazgos" ON public.hallazgos_auditoria;

CREATE POLICY "Usuarios pueden ver hallazgos de su org"
ON public.hallazgos_auditoria
FOR SELECT
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios pueden insertar hallazgos"
ON public.hallazgos_auditoria
FOR INSERT
WITH CHECK (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios pueden actualizar hallazgos"
ON public.hallazgos_auditoria
FOR UPDATE
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios pueden eliminar hallazgos"
ON public.hallazgos_auditoria
FOR DELETE
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);


-- 4c. tax_intelligence_rules: Eliminar políticas duplicadas permisivas
DROP POLICY IF EXISTS "Service role has full access" ON public.tax_intelligence_rules;
DROP POLICY IF EXISTS "Users can update rules for their org" ON public.tax_intelligence_rules;
-- Las políticas correctas ya existen (por operación con org_member check)


-- ============================================================
-- 5. AGREGAR POLÍTICAS FALTANTES A TABLAS CON RLS SIN POLICIES
-- ============================================================

-- 5a. cashflow_scenarios
CREATE POLICY "Usuarios ven escenarios de su org"
ON public.cashflow_scenarios
FOR SELECT
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios insertan escenarios en su org"
ON public.cashflow_scenarios
FOR INSERT
WITH CHECK (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios actualizan escenarios de su org"
ON public.cashflow_scenarios
FOR UPDATE
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios eliminan escenarios de su org"
ON public.cashflow_scenarios
FOR DELETE
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);


-- 5b. daily_cashflow_cache
CREATE POLICY "Usuarios ven cache de su org"
ON public.daily_cashflow_cache
FOR SELECT
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios insertan cache de su org"
ON public.daily_cashflow_cache
FOR INSERT
WITH CHECK (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios actualizan cache de su org"
ON public.daily_cashflow_cache
FOR UPDATE
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios eliminan cache de su org"
ON public.daily_cashflow_cache
FOR DELETE
USING (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);


-- 5c. human_reviews (usa hallazgo_id, no tiene organization_id directo)
CREATE POLICY "Usuarios ven reviews de hallazgos de su org"
ON public.human_reviews
FOR SELECT
USING (
    hallazgo_id IN (
        SELECT id FROM public.hallazgos
        WHERE organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Usuarios insertan reviews"
ON public.human_reviews
FOR INSERT
WITH CHECK (
    hallazgo_id IN (
        SELECT id FROM public.hallazgos
        WHERE organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Usuarios actualizan reviews"
ON public.human_reviews
FOR UPDATE
USING (
    hallazgo_id IN (
        SELECT id FROM public.hallazgos
        WHERE organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Usuarios eliminan reviews"
ON public.human_reviews
FOR DELETE
USING (
    hallazgo_id IN (
        SELECT id FROM public.hallazgos
        WHERE organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    )
);


-- 5d. notificaciones (tiene user_id y organization_id)
CREATE POLICY "Usuarios ven sus notificaciones"
ON public.notificaciones
FOR SELECT
USING (
    user_id = auth.uid()
    OR organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios insertan notificaciones en su org"
ON public.notificaciones
FOR INSERT
WITH CHECK (
    organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Usuarios actualizan sus notificaciones"
ON public.notificaciones
FOR UPDATE
USING (
    user_id = auth.uid()
);

CREATE POLICY "Usuarios eliminan sus notificaciones"
ON public.notificaciones
FOR DELETE
USING (
    user_id = auth.uid()
);


-- ============================================================
-- FIN DE MIGRACIÓN: Security Hardening
-- Hallazgos NO incluidos (por diseño):
--   - Mover extensiones pg_trgm/unaccent (riesgo operativo)
--   - Leaked Password Protection (configuración de panel Auth)
-- ============================================================
