
-- TERCER INTENTO: Nombre radicalmente diferente para forzar reconocimiento en caché
CREATE TABLE public.tax_intelligence_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    patron_busqueda TEXT NOT NULL,
    es_recuperable BOOLEAN DEFAULT FALSE,
    omitir_siempre BOOLEAN DEFAULT FALSE,
    estado TEXT DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'CLASIFICADO', 'IGNORADO')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, patron_busqueda)
);

-- RLS
ALTER TABLE public.tax_intelligence_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tax rules for their org" ON public.tax_intelligence_rules
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM public.organization_members WHERE organization_id = tax_intelligence_rules.organization_id
    ));

CREATE POLICY "Users can insert tax rules for their org" ON public.tax_intelligence_rules
    FOR INSERT WITH CHECK (auth.uid() IN (
        SELECT user_id FROM public.organization_members WHERE organization_id = tax_intelligence_rules.organization_id
    ));

CREATE POLICY "Users can update tax rules for their org" ON public.tax_intelligence_rules
    FOR UPDATE USING (auth.uid() IN (
        SELECT user_id FROM public.organization_members WHERE organization_id = tax_intelligence_rules.organization_id
    ));

CREATE POLICY "Users can delete tax rules for their org" ON public.tax_intelligence_rules
    FOR DELETE USING (auth.uid() IN (
        SELECT user_id FROM public.organization_members WHERE organization_id = tax_intelligence_rules.organization_id
    ));
