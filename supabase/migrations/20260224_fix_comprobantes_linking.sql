-- Migration: Add support for NC/ND linking and improved status tracking
-- Date: 2026-02-24

-- 1. Añadir columna para vinculación de comprobantes
ALTER TABLE public.comprobantes 
ADD COLUMN IF NOT EXISTS vinculado_id UUID REFERENCES public.comprobantes(id) ON DELETE SET NULL;

-- 2. Asegurar que los tipos están actualizados (aunque ya existían, reforzamos el check)
ALTER TABLE public.comprobantes 
DROP CONSTRAINT IF EXISTS comprobantes_tipo_check;

ALTER TABLE public.comprobantes 
ADD CONSTRAINT comprobantes_tipo_check 
CHECK (tipo IN ('factura_venta', 'factura_compra', 'nota_credito', 'nota_debito'));

-- 3. Comentario explicativo
COMMENT ON COLUMN public.comprobantes.vinculado_id IS 'Referencia al comprobante original que esta NC o ND está ajustando (Requerimiento AFIP Argentina)';
