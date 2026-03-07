-- Migration: Fix archivos_importados state constraint
-- Date: 2026-03-07
-- Description: Adds 'requiere_ajuste' to the allowed states for import logs.

BEGIN;

-- 1. Drop existing constraint
ALTER TABLE public.archivos_importados 
DROP CONSTRAINT IF EXISTS archivos_importados_estado_check;

-- 2. Add updated constraint
ALTER TABLE public.archivos_importados 
ADD CONSTRAINT archivos_importados_estado_check 
CHECK (estado IN ('procesando', 'completado', 'error', 'revertido', 'requiere_ajuste'));

-- 3. Update existing records if any (not needed but safe)
COMMIT;
