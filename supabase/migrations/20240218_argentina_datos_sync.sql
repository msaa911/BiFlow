-- Migration for ArgentinaDatos Sync Integration
-- Created: 2026-02-18

-- 1. Asegurar que la tabla indices_mercado tenga las columnas necesarias
ALTER TABLE public.indices_mercado 
ADD COLUMN IF NOT EXISTS tasa_plazo_fijo_30d NUMERIC,
ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'ArgentinaDatos';

-- 2. Asegurar que configuracion_empresa tenga el modo_tasa (por si no se ejecutó ayer)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='configuracion_empresa' AND column_name='modo_tasa') THEN
    ALTER TABLE configuracion_empresa ADD COLUMN modo_tasa TEXT DEFAULT 'AUTOMATICO' CHECK (modo_tasa IN ('AUTOMATICO', 'MANUAL'));
  END IF;
END $$;

-- 3. Habilitar seguridad (RLS)
ALTER TABLE public.indices_mercado ENABLE ROW LEVEL SECURITY;

-- Evitar duplicados de políticas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'indices_mercado' 
        AND policyname = 'Lectura pública para usuarios autenticados'
    ) THEN
        CREATE POLICY "Lectura pública para usuarios autenticados" 
        ON public.indices_mercado FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
