-- Migration: Link bank transactions to treasury movements
-- Date: 2024-02-28
-- Description: Add movimiento_id to transacciones to enable full administrative traceability.

ALTER TABLE public.transacciones 
ADD COLUMN IF NOT EXISTS movimiento_id UUID REFERENCES public.movimientos_tesoreria(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transacciones_movimiento ON public.transacciones(movimiento_id);
