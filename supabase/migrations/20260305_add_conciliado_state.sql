-- Migration: Add 'conciliado' state to comprobantes
-- Date: 2026-03-05

BEGIN;

-- 1. Actualizar la restricción CHECK de comprobantes
ALTER TABLE public.comprobantes 
DROP CONSTRAINT IF EXISTS comprobantes_estado_check;

ALTER TABLE public.comprobantes
ADD CONSTRAINT comprobantes_estado_check 
CHECK (estado IN ('pendiente', 'parcial', 'pagado', 'conciliado', 'anulado'));

COMMIT;
