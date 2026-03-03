-- Migration: Soporte para NDB/NCB como Comprobantes
-- Date: 2026-03-02

-- 1. Ampliar los tipos permitidos en la tabla de comprobantes
-- Nota: En Postgres no se puede alterar un CHECK constraint directamente de forma sencilla si es un enum o similar, 
-- pero aquí es una restricción de texto.

-- Primero eliminamos la restricción antigua si existe
ALTER TABLE public.comprobantes DROP CONSTRAINT IF EXISTS comprobantes_tipo_check;

-- Agregamos la nueva restricción con los tipos bancarios
ALTER TABLE public.comprobantes ADD CONSTRAINT comprobantes_tipo_check 
CHECK (tipo IN ('factura_venta', 'factura_compra', 'nota_credito', 'nota_debito', 'ndb_bancaria', 'ncb_bancaria'));

-- 2. Asegurar que movimientos_tesoreria tenga la columna clase_documento
ALTER TABLE public.movimientos_tesoreria 
ADD COLUMN IF NOT EXISTS clase_documento text CHECK (clase_documento IN ('OP', 'Recibo', 'NDB', 'NCB'));

-- 3. Comentario para el desarrollador
COMMENT ON COLUMN public.comprobantes.tipo IS 'ndb_bancaria y ncb_bancaria se usan para registrar gastos/ingresos directos del extracto bancario.';
