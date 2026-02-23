-- Migration: Advanced Treasury Schema (v4.0)
-- Date: 2026-02-23
-- Description: Adds support for Recibos, OP, and multiple payment instruments (Cartera de Valores).

-- 1. Table for Treasury Movements (Header for Recibos/Órdenes de Pago)
CREATE TABLE IF NOT EXISTS public.movimientos_tesoreria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    entidad_id UUID NOT NULL REFERENCES public.entidades(id) ON DELETE CASCADE,
    tipo text NOT NULL CHECK (tipo IN ('cobro', 'pago')),
    fecha date NOT NULL DEFAULT CURRENT_DATE,
    monto_total numeric(12,2) NOT NULL DEFAULT 0,
    moneda text NOT NULL DEFAULT 'ARS',
    observaciones text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Table for Payment Applications (N:M relationship between movements and invoices)
CREATE TABLE IF NOT EXISTS public.aplicaciones_pago (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movimiento_id UUID NOT NULL REFERENCES public.movimientos_tesoreria(id) ON DELETE CASCADE,
    comprobante_id UUID NOT NULL REFERENCES public.comprobantes(id) ON DELETE CASCADE,
    monto_aplicado numeric(12,2) NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 3. Table for Payment Instruments (Values like Cheques, Cash, Transfers)
CREATE TABLE IF NOT EXISTS public.instrumentos_pago (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movimiento_id UUID NOT NULL REFERENCES public.movimientos_tesoreria(id) ON DELETE CASCADE,
    metodo text NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'cheque_propio', 'cheque_terceros', 'tarjeta_debito', 'tarjeta_credito', 'retenciones', 'a_convenir')),
    monto numeric(12,2) NOT NULL,
    fecha_disponibilidad date NOT NULL DEFAULT CURRENT_DATE, -- Critical for CFO proyections (e.g. deferred checks)
    banco text,
    referencia text, -- Check number, transfer ID, etc.
    estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'acreditado', 'rechazado', 'anulado')),
    created_at timestamptz DEFAULT now()
);

-- 4. RLS Policies
ALTER TABLE public.movimientos_tesoreria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aplicaciones_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrumentos_pago ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view treasury movements of their org" ON public.movimientos_tesoreria
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM organization_users WHERE organization_id = public.movimientos_tesoreria.organization_id));

CREATE POLICY "Users can insert treasury movements of their org" ON public.movimientos_tesoreria
    FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM organization_users WHERE organization_id = public.movimientos_tesoreria.organization_id));

-- (Policies for other tables follow same pattern)
CREATE POLICY "Users can access applications of their org" ON public.aplicaciones_pago
    FOR ALL USING (movimiento_id IN (SELECT id FROM public.movimientos_tesoreria));

CREATE POLICY "Users can access instruments of their org" ON public.instrumentos_pago
    FOR ALL USING (movimiento_id IN (SELECT id FROM public.movimientos_tesoreria));

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_movimientos_org_fecha ON public.movimientos_tesoreria(organization_id, fecha);
CREATE INDEX IF NOT EXISTS idx_aplicaciones_comprobante ON public.aplicaciones_pago(comprobante_id);
CREATE INDEX IF NOT EXISTS idx_instrumentos_vencimiento ON public.instrumentos_pago(fecha_disponibilidad);
