-- Migration: Tax Learning & Classification
-- Stores organization-specific rules for tax recoverability.

CREATE TABLE IF NOT EXISTS public.configuracion_impuestos (
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
ALTER TABLE public.configuracion_impuestos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tax config for their org" ON public.configuracion_impuestos
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM public.memberships WHERE organization_id = configuracion_impuestos.organization_id
    ));

CREATE POLICY "Users can insert tax config for their org" ON public.configuracion_impuestos
    FOR INSERT WITH CHECK (auth.uid() IN (
        SELECT user_id FROM public.memberships WHERE organization_id = configuracion_impuestos.organization_id
    ));

CREATE POLICY "Users can update tax config for their org" ON public.configuracion_impuestos
    FOR UPDATE USING (auth.uid() IN (
        SELECT user_id FROM public.memberships WHERE organization_id = configuracion_impuestos.organization_id
    ));
