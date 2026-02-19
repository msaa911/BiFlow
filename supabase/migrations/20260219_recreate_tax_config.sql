
-- Re-create configuracion_impuestos if missing or corrupted
CREATE TABLE IF NOT EXISTS public.configuracion_impuestos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    patron_busqueda TEXT NOT NULL,
    es_recuperable BOOLEAN DEFAULT FALSE,
    omitir_siempre BOOLEAN DEFAULT FALSE,
    estado TEXT DEFAULT 'PENDIENTE', -- PENDIENTE, CLASIFICADO, IGNORADO
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, patron_busqueda)
);

-- Enable RLS
ALTER TABLE public.configuracion_impuestos ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view tax config for their org" ON public.configuracion_impuestos;
CREATE POLICY "Users can view tax config for their org" ON public.configuracion_impuestos
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.organization_members WHERE organization_id = configuracion_impuestos.organization_id));

DROP POLICY IF EXISTS "Users can insert tax config for their org" ON public.configuracion_impuestos;
CREATE POLICY "Users can insert tax config for their org" ON public.configuracion_impuestos
    FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM public.organization_members WHERE organization_id = configuracion_impuestos.organization_id));

DROP POLICY IF EXISTS "Users can update tax config for their org" ON public.configuracion_impuestos;
CREATE POLICY "Users can update tax config for their org" ON public.configuracion_impuestos
    FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM public.organization_members WHERE organization_id = configuracion_impuestos.organization_id));

DROP POLICY IF EXISTS "Users can delete tax config for their org" ON public.configuracion_impuestos;
CREATE POLICY "Users can delete tax config for their org" ON public.configuracion_impuestos
    FOR DELETE USING (auth.uid() IN (SELECT user_id FROM public.organization_members WHERE organization_id = configuracion_impuestos.organization_id));
