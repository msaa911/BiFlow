
-- New table name to bypass stuck PostgREST cache
CREATE TABLE public.reglas_fiscales_ia (
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
ALTER TABLE public.reglas_fiscales_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tax config for their org" ON public.reglas_fiscales_ia
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM public.organization_members WHERE organization_id = reglas_fiscales_ia.organization_id
    ));

CREATE POLICY "Users can insert tax config for their org" ON public.reglas_fiscales_ia
    FOR INSERT WITH CHECK (auth.uid() IN (
        SELECT user_id FROM public.organization_members WHERE organization_id = reglas_fiscales_ia.organization_id
    ));

CREATE POLICY "Users can update tax config for their org" ON public.reglas_fiscales_ia
    FOR UPDATE USING (auth.uid() IN (
        SELECT user_id FROM public.organization_members WHERE organization_id = reglas_fiscales_ia.organization_id
    ));

CREATE POLICY "Users can delete tax config for their org" ON public.reglas_fiscales_ia
    FOR DELETE USING (auth.uid() IN (
        SELECT user_id FROM public.organization_members WHERE organization_id = reglas_fiscales_ia.organization_id
    ));
