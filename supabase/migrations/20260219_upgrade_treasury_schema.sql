
-- Migration: Upgrade Treasury Schema (v2.0)
-- Date: 2026-02-19

-- 1. Extend COMPROBANTES
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS numero_cheque text;
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS nombre_entidad text;
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS cuit_socio_original text; -- Backup for original string

-- 2. Extend TRANSACCIONES
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS numero_cheque text;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS comprobante_id UUID REFERENCES public.comprobantes(id) ON DELETE SET NULL;

-- 3. Create ENTIDADES table (if not exists)
CREATE TABLE IF NOT EXISTS public.entidades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    cuit text NOT NULL,
    razon_social text NOT NULL,
    categoria text, -- 'cliente', 'proveedor', 'ambos'
    rating_scoring text,
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(organization_id, cuit)
);

-- 4. Create CHEQUES table for instrument tracking
CREATE TABLE IF NOT EXISTS public.cheques (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    numero text NOT NULL,
    banco text,
    monto decimal(15, 2) NOT NULL,
    fecha_emision date,
    fecha_pago date NOT NULL,
    tipo text CHECK (tipo IN ('propio', 'terceros')),
    estado text DEFAULT 'en_cartera' CHECK (estado IN ('en_cartera', 'depositado', 'entregado', 'cobrado', 'rechazado')),
    entidad_id UUID REFERENCES public.entidades(id),
    comprobante_id UUID REFERENCES public.comprobantes(id),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for new tables
ALTER TABLE public.entidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View entidades" ON public.entidades FOR SELECT USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = entidades.organization_id));
CREATE POLICY "Insert entidades" ON public.entidades FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = entidades.organization_id));

CREATE POLICY "View cheques" ON public.cheques FOR SELECT USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = cheques.organization_id));
CREATE POLICY "Insert cheques" ON public.cheques FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = cheques.organization_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comprobantes_cheque ON public.comprobantes(organization_id, numero_cheque);
CREATE INDEX IF NOT EXISTS idx_transacciones_cheque ON public.transacciones(organization_id, numero_cheque);
CREATE INDEX IF NOT EXISTS idx_entidades_cuit ON public.entidades(organization_id, cuit);
