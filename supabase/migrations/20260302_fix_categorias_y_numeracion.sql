-- Migration: Fix Categorias y Numeración de Tesorería
-- Date: 2026-03-02

-- 1. Agregar columna 'categoria' a movimientos_tesoreria
ALTER TABLE public.movimientos_tesoreria ADD COLUMN IF NOT EXISTS categoria text;

-- 2. Actualizar la función de numeración para:
--    a. Respetar el número si ya viene definido (ej: Notas Bancarias)
--    b. Usar el prefijo correcto según la clase de documento (NDB/NCB)
CREATE OR REPLACE FUNCTION public.get_next_treasury_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    prefix TEXT;
BEGIN
    -- 1. Si el número ya viene definido (desde el frontend o el banco), no sobreescribir
    IF NEW.numero IS NOT NULL AND NEW.numero <> '' AND NEW.numero NOT LIKE 'OP-%' AND NEW.numero NOT LIKE 'RC-%' THEN
        RETURN NEW;
    END IF;

    -- 2. Obtener el siguiente correlativo para la organización y tipo
    SELECT COALESCE(MAX(numero_correlativo), 0) + 1 INTO next_num
    FROM public.movimientos_tesoreria
    WHERE organization_id = NEW.organization_id AND tipo = NEW.tipo;

    NEW.numero_correlativo := next_num;
    
    -- 3. Determinar el prefijo (NDB/NCB tienen prioridad si están definidos)
    IF NEW.clase_documento IS NOT NULL AND NEW.clase_documento IN ('NDB', 'NCB') THEN
        prefix := NEW.clase_documento;
    ELSE
        prefix := CASE WHEN NEW.tipo = 'cobro' THEN 'RC' ELSE 'OP' END;
    END IF;

    -- 4. Formatear el número final (ej: NDB-000001 si no se proveyó uno)
    IF NEW.numero IS NULL OR NEW.numero = '' THEN
        NEW.numero := prefix || '-' || LPAD(next_num::text, 6, '0');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Comentario para el cache de esquema
COMMENT ON COLUMN public.movimientos_tesoreria.categoria IS 'Concepto principal de gasto o ingreso para el flujo de caja.';
