
-- Migration: Add custom invoice types (Ingresos/Egresos Varios)
-- Date: 2026-02-28

-- 1. Identify and drop existing check constraint on comprobantes.tipo
-- Since it might have different names depending on the migration version, we try to drop the common ones or use a generic approach
ALTER TABLE public.comprobantes DROP CONSTRAINT IF EXISTS comprobantes_tipo_check;

-- 2. Add updated check constraint including the new types
ALTER TABLE public.comprobantes 
ADD CONSTRAINT comprobantes_tipo_check 
CHECK (tipo IN ('factura_venta', 'factura_compra', 'nota_credito', 'nota_debito', 'ingreso_vario', 'egreso_vario'));

-- 3. Comment for documentation
COMMENT ON COLUMN public.comprobantes.tipo IS 'Tipo de comprobante: factura_venta, factura_compra, nota_credito, nota_debito, ingreso_vario, egreso_vario';
