-- Migration: Treasury Numbering System
-- Description: Adds automatic chronological numbering for Receipts (RC) and Payment Orders (OP) per organization.

-- 1. Add columns to movimientos_tesoreria
ALTER TABLE public.movimientos_tesoreria 
ADD COLUMN IF NOT EXISTS numero_correlativo INTEGER,
ADD COLUMN IF NOT EXISTS numero TEXT;

-- 2. Create function to calculate the next number
CREATE OR REPLACE FUNCTION public.get_next_treasury_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    prefix TEXT;
BEGIN
    -- Get the next number for this specific organization and type (cobro/pago)
    SELECT COALESCE(MAX(numero_correlativo), 0) + 1 INTO next_num
    FROM public.movimientos_tesoreria
    WHERE organization_id = NEW.organization_id AND tipo = NEW.tipo;

    NEW.numero_correlativo := next_num;
    
    -- Format the number depending on the type
    -- RC (Recibo) for 'cobro'
    -- OP (Orden de Pago) for 'pago'
    prefix := CASE WHEN NEW.tipo = 'cobro' THEN 'RC' ELSE 'OP' END;
    NEW.numero := prefix || '-' || LPAD(next_num::text, 6, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS tr_assign_treasury_number ON public.movimientos_tesoreria;
CREATE TRIGGER tr_assign_treasury_number
BEFORE INSERT ON public.movimientos_tesoreria
FOR EACH ROW
EXECUTE FUNCTION public.get_next_treasury_number();

-- 4. Initial numbering for existing records (if any)
-- This logic assumes we want to number them by creation date
WITH numbered_movements AS (
    SELECT id, 
           tipo,
           organization_id,
           ROW_NUMBER() OVER (PARTITION BY organization_id, tipo ORDER BY created_at ASC) as calc_num
    FROM public.movimientos_tesoreria
)
UPDATE public.movimientos_tesoreria m
SET numero_correlativo = nm.calc_num,
    numero = (CASE WHEN m.tipo = 'cobro' THEN 'RC' ELSE 'OP' END) || '-' || LPAD(nm.calc_num::text, 6, '0')
FROM numbered_movements nm
WHERE m.id = nm.id AND m.numero IS NULL;
