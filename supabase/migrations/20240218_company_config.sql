
-- Migration: Company Financial Configuration (TNA & Overdraft)
-- Date: 2024-02-18

CREATE TABLE IF NOT EXISTS public.configuracion_empresa (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    tna NUMERIC DEFAULT 0.70, -- 70% Annual Interest Rate
    limite_descubierto NUMERIC DEFAULT 0, -- Overdraft limit in ARS
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE public.configuracion_empresa ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own org config" ON public.configuracion_empresa
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own org config" ON public.configuracion_empresa
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own org config" ON public.configuracion_empresa
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_configuracion_empresa_updated_at
    BEFORE UPDATE ON public.configuracion_empresa
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
