-- Migración corregida: Añadir columnas y migrar datos sin borrar originales
-- Evita el error ERROR: 23502 al no intentar poner NULL en cuit_socio

-- 1. Añadir columnas faltantes si no existen
ALTER TABLE public.comprobantes 
ADD COLUMN IF NOT EXISTS razon_social_entidad TEXT,
ADD COLUMN IF NOT EXISTS cuit_entidad TEXT;

-- 2. Migrar datos desde nombre_entidad a razon_social_entidad
-- (Prioriza nombre_entidad si razon_social_entidad está vacío)
UPDATE public.comprobantes
SET razon_social_entidad = nombre_entidad
WHERE (razon_social_entidad IS NULL OR razon_social_entidad = '') 
  AND (nombre_entidad IS NOT NULL AND nombre_entidad != '');

-- 3. Copiar datos desde las columnas antiguas 'socio' a las nuevas 'entidad'
-- No borramos los datos originales de cuit_socio porque tiene restricción NOT NULL
UPDATE public.comprobantes
SET 
    razon_social_entidad = COALESCE(NULLIF(razon_social_entidad, ''), razon_social_socio),
    cuit_entidad = COALESCE(NULLIF(cuit_entidad, ''), cuit_socio)
WHERE 
    (razon_social_socio IS NOT NULL AND razon_social_socio != '') OR 
    (cuit_socio IS NOT NULL AND cuit_socio != '');

-- 4. Actualizar el caché de PostgREST
ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS temp_refresh_col TEXT;
ALTER TABLE public.comprobantes DROP COLUMN IF EXISTS temp_refresh_col;
