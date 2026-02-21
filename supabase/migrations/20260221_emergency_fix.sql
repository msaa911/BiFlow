-- Emergency Fix: Missing metadata column in comprobantes
-- Date: 2026-02-21

ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Extra hardening for bank statement uploads
ALTER TABLE public.transacciones ALTER COLUMN descripcion DROP NOT NULL;
ALTER TABLE public.transacciones ALTER COLUMN descripcion SET DEFAULT 'Sin Descripción';
