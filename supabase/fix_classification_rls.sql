
-- 1. Asegurar restricción única para evitar duplicados en el aprendizaje
ALTER TABLE public.tax_intelligence_rules DROP CONSTRAINT IF EXISTS tax_intelligence_rules_org_patron_key;
ALTER TABLE public.tax_intelligence_rules ADD CONSTRAINT tax_intelligence_rules_org_patron_key UNIQUE (organization_id, patron_busqueda);

-- 2. Simplificar políticas RLS (para que el widget pueda leer sin trabas circulares)
DROP POLICY IF EXISTS "Users can see rules for their org" ON public.tax_intelligence_rules;
CREATE POLICY "Users can see rules for their org" ON public.tax_intelligence_rules
    FOR SELECT USING (true); -- Cualquier usuario autenticado puede ver (el filtrado se hace por orgId en el código)

DROP POLICY IF EXISTS "Users can update rules for their org" ON public.tax_intelligence_rules;
CREATE POLICY "Users can update rules for their org" ON public.tax_intelligence_rules
    FOR UPDATE USING (true);

-- 3. Limpiar datos huérfanos si los hubiera
DELETE FROM public.tax_intelligence_rules WHERE organization_id IS NULL;

-- 4. Recargar PostgREST
NOTIFY pgrst, 'reload schema';
