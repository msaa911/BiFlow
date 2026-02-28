-- Migration: Allow manual treasury numbering
-- Date: 2026-03-01
-- Description: Updates get_next_treasury_number to respect manually entered numbers.

CREATE OR REPLACE FUNCTION public.get_next_treasury_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    prefix TEXT;
BEGIN
    -- If the number is already provided (not null and not empty), we don't overwrite it
    IF NEW.numero IS NOT NULL AND NEW.numero <> '' AND NEW.numero <> 'RC-S/N' AND NEW.numero <> 'OP-S/N' THEN
        RETURN NEW;
    END IF;

    -- Get the next number for this specific organization and type (cobro/pago)
    SELECT COALESCE(MAX(numero_correlativo), 0) + 1 INTO next_num
    FROM public.movimientos_tesoreria
    WHERE organization_id = NEW.organization_id AND tipo = NEW.tipo;

    NEW.numero_correlativo := next_num;
    
    -- Format the number depending on the type
    prefix := CASE WHEN NEW.tipo = 'cobro' THEN 'RC' ELSE 'OP' END;
    NEW.numero := prefix || '-' || LPAD(next_num::text, 6, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
