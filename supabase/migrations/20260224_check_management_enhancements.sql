-- Migration: Enhance Instrument States for Check Management
-- Description: Adds 'endosado' and 'depositado' states and a 'vinculo_instrumento_id' to track check flow.

-- 1. Update the check constraint for estado
ALTER TABLE public.instrumentos_pago 
DROP CONSTRAINT IF EXISTS instrumentos_pago_estado_check;

ALTER TABLE public.instrumentos_pago 
ADD CONSTRAINT instrumentos_pago_estado_check 
CHECK (estado IN ('pendiente', 'acreditado', 'rechazado', 'anulado', 'endosado', 'depositado'));

-- 2. Add column to track endorsed instruments (linking a payment instrument to the original collection instrument)
ALTER TABLE public.instrumentos_pago 
ADD COLUMN IF NOT EXISTS vinculo_instrumento_id UUID REFERENCES public.instrumentos_pago(id);

-- 3. Add column to track which entity now has the check (for endorsements)
ALTER TABLE public.instrumentos_pago 
ADD COLUMN IF NOT EXISTS titular_actual_id UUID REFERENCES public.entidades(id);
