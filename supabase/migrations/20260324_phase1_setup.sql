-- Migration: Fase 1 - Setup de Base de Datos (Sprint 2)
-- Date: 2026-03-24
-- Author: BiFlow Agent
-- Description: Preparación para conciliación v4.0 (Extensiones, Índices GIN e Integridad)

BEGIN;

-- 1. Extensiones (Seguridad y Búsqueda)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- 2. Índices GIN para Fuzzy Search (L3)
-- Optimizamos la búsqueda en descripciones bancarias y facturas
CREATE INDEX IF NOT EXISTS idx_transacciones_descripcion_trgm ON public.transacciones USING gin (descripcion gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_comprobantes_descripcion_trgm ON public.comprobantes USING gin (descripcion gin_trgm_ops);

-- 3. Refuerzo de Integridad Referencial (Auditoría Financiera)
-- Cambiamos ON DELETE CASCADE/SET NULL a RESTRICT en comprobantes
-- Esto evita que se eliminen organizaciones o entidades que tengan comprobantes vinculados (evita pérdida de rastro)

-- 3.1 Entidad ID
ALTER TABLE public.comprobantes 
DROP CONSTRAINT IF EXISTS comprobantes_entidad_id_fkey;

ALTER TABLE public.comprobantes
ADD CONSTRAINT comprobantes_entidad_id_fkey 
FOREIGN KEY (entidad_id) 
REFERENCES public.entidades(id) 
ON DELETE RESTRICT;

-- 3.2 Organization ID
ALTER TABLE public.comprobantes 
DROP CONSTRAINT IF EXISTS comprobantes_organization_id_fkey;

ALTER TABLE public.comprobantes
ADD CONSTRAINT comprobantes_organization_id_fkey 
FOREIGN KEY (organization_id) 
REFERENCES public.organizations(id) 
ON DELETE RESTRICT;

-- 4. Índices de Rendimiento para Matching de Montos (L1/L2)
CREATE INDEX IF NOT EXISTS idx_comprobantes_cfo_match ON public.comprobantes (organization_id, estado, tipo, monto_total);

COMMIT;
