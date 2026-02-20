-- Migration: Initial Bank Accounts & Starting Balances
-- Allows companies to define a starting point for their account balances.

-- 1. Create the bank accounts table
CREATE TABLE IF NOT EXISTS public.cuentas_bancarias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    banco_nombre TEXT NOT NULL, -- Ej: Banco Galicia
    cbu TEXT,
    saldo_inicial NUMERIC DEFAULT 0, -- Aquí guardamos los $65.000.000
    moneda TEXT DEFAULT 'ARS',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.cuentas_bancarias ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'cuentas_bancarias' 
        AND policyname = 'Users can manage their org accounts'
    ) THEN
        CREATE POLICY "Users can manage their org accounts" ON public.cuentas_bancarias
            USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = cuentas_bancarias.organization_id))
            WITH CHECK (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = cuentas_bancarias.organization_id));
    END IF;
END $$;

COMMENT ON TABLE public.cuentas_bancarias IS 'Cuentas bancarias de la organización con sus saldos de arranque para conciliación';
