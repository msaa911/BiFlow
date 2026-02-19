
-- 1. Crear la tabla de reglas de impuestos (si no existe)
CREATE TABLE IF NOT EXISTS public.tax_intelligence_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    patron_busqueda TEXT NOT NULL,
    categoria TEXT DEFAULT 'impuesto', -- 'impuesto' o 'servicio'
    es_recuperable BOOLEAN DEFAULT false,
    omitir_siempre BOOLEAN DEFAULT false,
    estado TEXT DEFAULT 'PENDIENTE', -- 'PENDIENTE', 'CONFIGURADO'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar RLS
ALTER TABLE public.tax_intelligence_rules ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de acceso
CREATE POLICY "Users can see rules for their org" ON public.tax_intelligence_rules
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM public.organization_members 
            WHERE organization_id = tax_intelligence_rules.organization_id
        )
    );

CREATE POLICY "Users can update rules for their org" ON public.tax_intelligence_rules
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT user_id FROM public.organization_members 
            WHERE organization_id = tax_intelligence_rules.organization_id
        )
    );

CREATE POLICY "Service role has full access" ON public.tax_intelligence_rules
    FOR ALL USING (true);

-- 4. Notificar a PostgREST que recargue el esquema
NOTIFY pgrst, 'reload schema';
