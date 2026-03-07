-- Migration: Treasury Multibanco Link
-- Date: 2026-03-07
-- Description: Adds cuenta_id to treasury tables to align with Multibanco architecture.

BEGIN;

-- 1. Update movimientos_tesoreria
ALTER TABLE public.movimientos_tesoreria 
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

-- 2. Update instrumentos_pago
-- Each instrument (e.g. a transfer or checked issued) should ideally know its source/target account
ALTER TABLE public.instrumentos_pago 
ADD COLUMN IF NOT EXISTS cuenta_id UUID REFERENCES public.cuentas_bancarias(id) ON DELETE SET NULL;

-- 3. Create indexes for faster reconciliation and cash flow filtering
CREATE INDEX IF NOT EXISTS idx_movimientos_tesoreria_cuenta ON public.movimientos_tesoreria(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_instrumentos_pago_cuenta ON public.instrumentos_pago(cuenta_id);

COMMIT;
