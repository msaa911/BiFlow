
-- Migration: Treasury Hub (AP/AR & Cash Flow Coverage)
-- Date: 2026-02-18

-- 1. COMPROBANTES (Invoices, Credit Notes, etc.)
CREATE TABLE IF NOT EXISTS public.comprobantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('factura_venta', 'factura_compra', 'nota_credito', 'nota_debito')),
    numero text,
    cuit_socio text NOT NULL, -- CUIT del cliente o proveedor
    razon_social_socio text,
    fecha_emision date NOT NULL,
    fecha_vencimiento date NOT NULL,
    monto_total decimal(15, 2) NOT NULL,
    monto_pendiente decimal(15, 2) NOT NULL,
    estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'parcial', 'pagado', 'anulado')),
    moneda text DEFAULT 'ARS',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. PAGOS_PROYECTADOS (Treasury Board)
CREATE TABLE IF NOT EXISTS public.pagos_proyectados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    comprobante_id UUID REFERENCES public.comprobantes(id) ON DELETE CASCADE, -- Opcional, puede ser un pago manual
    fecha_pago_proyectada date NOT NULL,
    monto decimal(15, 2) NOT NULL,
    descripcion text,
    estado text DEFAULT 'programado' CHECK (estado IN ('programado', 'ejecutado', 'cancelado')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.comprobantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_proyectados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View comprobantes" ON public.comprobantes FOR SELECT USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = comprobantes.organization_id));
CREATE POLICY "Insert comprobantes" ON public.comprobantes FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = comprobantes.organization_id));

CREATE POLICY "View pagos_proyectados" ON public.pagos_proyectados FOR SELECT USING (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = pagos_proyectados.organization_id));
CREATE POLICY "Insert pagos_proyectados" ON public.pagos_proyectados FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = pagos_proyectados.organization_id));

-- Index for coverage calculation
CREATE INDEX idx_pagos_proyectados_fecha ON public.pagos_proyectados(organization_id, fecha_pago_proyectada) WHERE estado = 'programado';
CREATE INDEX idx_comprobantes_vencimiento ON public.comprobantes(organization_id, fecha_vencimiento) WHERE estado != 'pagado';
