-- Migration: Fix Cascade Deletion for Comprobantes
-- Date: 2026-02-21

-- 1. Add missing column to comprobantes
ALTER TABLE public.comprobantes 
ADD COLUMN IF NOT EXISTS archivo_importacion_id UUID REFERENCES public.archivos_importados(id) ON DELETE CASCADE;

-- 2. Index for performance
CREATE INDEX IF NOT EXISTS idx_comprobantes_import_id ON public.comprobantes(archivo_importacion_id);
