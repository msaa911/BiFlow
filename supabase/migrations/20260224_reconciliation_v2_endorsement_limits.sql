-- Migration: Endorsement Tracking and Check Types
-- Description: Adds cant_endosos and tipo_cheque to instrumentos_pago for BCRA compliance.

ALTER TABLE public.instrumentos_pago 
ADD COLUMN IF NOT EXISTS cant_endosos INTEGER DEFAULT 0;

ALTER TABLE public.instrumentos_pago 
ADD COLUMN IF NOT EXISTS tipo_cheque text CHECK (tipo_cheque IN ('comun', 'cpd'));

-- Update existing records to 'cpd' as default or based on date if possible
UPDATE public.instrumentos_pago SET tipo_cheque = 'cpd' WHERE metodo = 'cheque_terceros' OR metodo = 'cheque_propio';
