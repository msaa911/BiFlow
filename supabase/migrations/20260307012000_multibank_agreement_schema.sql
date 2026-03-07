-- Migration: Multi-Bank Agreement Schema
-- Description: Adds columns to support individual bank agreements (overdraft, maintenance, liquidity cushion) per account.

-- 1. Añadir columnas de acuerdos a la tabla de cuentas_bancarias
ALTER TABLE public.cuentas_bancarias 
ADD COLUMN IF NOT EXISTS colchon_liquidez NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS limite_descubierto NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS mantenimiento_pactado NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS comision_cheque NUMERIC DEFAULT 0;

-- 2. Añadir comentarios informativos
COMMENT ON COLUMN public.cuentas_bancarias.colchon_liquidez IS 'Colchón de seguridad que BiFlow debe ignorar para inversiones';
COMMENT ON COLUMN public.cuentas_bancarias.limite_descubierto IS 'Límite de giro en descubierto acordado con este banco';
COMMENT ON COLUMN public.cuentas_bancarias.mantenimiento_pactado IS 'Costo mensual fijo de mantenimiento de esta cuenta';
COMMENT ON COLUMN public.cuentas_bancarias.comision_cheque IS 'Comisión por cada cheque depositado en esta cuenta';
