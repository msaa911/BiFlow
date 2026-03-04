-- Migration: Refactorización Estructural de Nombres (BiFlow Admin)
-- Date: 2026-03-04
-- Author: Antigravity

BEGIN;

-- 1. Tabla: movimientos_tesoreria
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos_tesoreria' AND column_name = 'categoria') THEN
        ALTER TABLE public.movimientos_tesoreria RENAME COLUMN categoria TO concepto;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos_tesoreria' AND column_name = 'numero') THEN
        ALTER TABLE public.movimientos_tesoreria RENAME COLUMN numero TO nro_comprobante;
    END IF;
END $$;

-- 2. Tabla: instrumentos_pago
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instrumentos_pago' AND column_name = 'referencia') THEN
        ALTER TABLE public.instrumentos_pago RENAME COLUMN referencia TO detalle_referencia;
    END IF;
END $$;

-- 3. Tabla: comprobantes
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'comprobantes' AND column_name = 'numero') THEN
        ALTER TABLE public.comprobantes RENAME COLUMN numero TO nro_factura;
    END IF;
END $$;

-- 4. Actualizar la función de numeración (Referenciaba 'numero')
CREATE OR REPLACE FUNCTION public.get_next_treasury_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    prefix TEXT;
BEGIN
    -- 1. Si el número ya viene definido, no sobreescribir
    IF NEW.nro_comprobante IS NOT NULL AND NEW.nro_comprobante <> '' AND NEW.nro_comprobante NOT LIKE 'OP-%' AND NEW.nro_comprobante NOT LIKE 'RC-%' THEN
        RETURN NEW;
    END IF;

    -- 2. Obtener el siguiente correlativo
    SELECT COALESCE(MAX(numero_correlativo), 0) + 1 INTO next_num
    FROM public.movimientos_tesoreria
    WHERE organization_id = NEW.organization_id AND tipo = NEW.tipo;

    NEW.numero_correlativo := next_num;
    
    -- 3. Determinar el prefijo
    IF NEW.clase_documento IS NOT NULL AND NEW.clase_documento IN ('NDB', 'NCB') THEN
        prefix := NEW.clase_documento;
    ELSE
        prefix := CASE WHEN NEW.tipo = 'cobro' THEN 'RC' ELSE 'OP' END;
    END IF;

    -- 4. Formatear el número final
    IF NEW.nro_comprobante IS NULL OR NEW.nro_comprobante = '' THEN
        NEW.nro_comprobante := prefix || '-' || LPAD(next_num::text, 6, '0');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
