
-- Cumulative Schema Setup: Financial Thesaurus & Company Config
-- Date: 2024-02-18

-- 1. Financial Thesaurus Table
CREATE TABLE IF NOT EXISTS public.financial_thesaurus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_pattern TEXT UNIQUE NOT NULL, -- e.g., "COM. MANT."
    normalized_concept TEXT NOT NULL, -- e.g., "MANTENIMIENTO DE CUENTA"
    category TEXT, -- e.g., "gastos_bancarios"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Company Financial Configuration Table
CREATE TABLE IF NOT EXISTS public.configuracion_empresa (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    tna NUMERIC DEFAULT 0.70, -- 70% Annual Interest Rate
    limite_descubierto NUMERIC DEFAULT 0, -- Overdraft limit in ARS
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(organization_id)
);

-- 3. Seed some default patterns for the thesaurus
INSERT INTO public.financial_thesaurus (raw_pattern, normalized_concept, category)
VALUES 
('COM. MANT.', 'MANTENIMIENTO DE CUENTA', 'banco'),
('COMISION MANT.', 'MANTENIMIENTO DE CUENTA', 'banco'),
('IMP.LEY 25413', 'IMPUESTO DEBITO/CREDITO', 'impuestos'),
('IVA RI', 'IVA RESPONSABLE INSCRIPTO', 'impuestos'),
('AJUSTE POR REDONDEO', 'REDONDEO', 'otros')
ON CONFLICT (raw_pattern) DO NOTHING;

-- 4. Enable RLS
ALTER TABLE public.financial_thesaurus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_empresa ENABLE ROW LEVEL SECURITY;

-- 5. Policies
CREATE POLICY "Public read thesaurus" ON public.financial_thesaurus FOR SELECT USING (true);

CREATE POLICY "Users can manage own org config" ON public.configuracion_empresa
    FOR ALL USING (
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
