-- Migration: Interbanking Preset & Market Indices Expansion
-- Created: 2026-02-18

-- 1. Ampliar indices_mercado para incluir Dólar
ALTER TABLE public.indices_mercado 
ADD COLUMN IF NOT EXISTS dolar_oficial NUMERIC,
ADD COLUMN IF NOT EXISTS dolar_blue NUMERIC;

-- 2. Inyectar Preset de Interbanking (Fixed Width)
-- Usamos una subconsulta para obtener la primera organización disponible
DO $$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    
    IF v_org_id IS NOT NULL THEN
        INSERT INTO public.formato_archivos (organization_id, nombre, descripcion, tipo, reglas)
        VALUES (
            v_org_id,
            'Interbanking Estándar (.dat)',
            'Formato de ancho fijo para transferencias Interbanking (Cash Management)',
            'fixed_width',
            '{
                "fecha": {"start": 0, "end": 8},
                "cuit": {"start": 30, "end": 41},
                "descripcion": {"start": 41, "end": 93},
                "monto": {"start": 93, "end": 105}
            }'::jsonb
        )
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
