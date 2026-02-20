-- Migration for BCRA TNA Automation
-- Created: 2024-02-18

-- Paso 2: Crear Tabla de Índices Globales
CREATE TABLE IF NOT EXISTS indices_mercado (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
  tasa_plazo_fijo NUMERIC, -- Tasa de referencia
  tasa_badlar NUMERIC,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Actualizamos la tabla de configuración de la empresa para soportar el modo automático
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='configuracion_empresa' AND column_name='modo_tasa') THEN
    ALTER TABLE configuracion_empresa ADD COLUMN modo_tasa TEXT DEFAULT 'AUTOMATICO' CHECK (modo_tasa IN ('AUTOMATICO', 'MANUAL'));
  END IF;
END $$;
