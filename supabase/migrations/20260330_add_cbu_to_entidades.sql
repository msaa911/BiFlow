-- Migration: Add CBU to Entidades
-- Date: 2026-03-30
-- Description: Adds CBU column and index to enable Level 2 (Trust Ledger) reconciliation.

BEGIN;

-- 1. Agregar columna CBU de forma segura
ALTER TABLE public.entidades 
ADD COLUMN IF NOT EXISTS cbu VARCHAR(255);

-- 2. Crear índice para optimizar cruces de extractos bancarios
CREATE INDEX IF NOT EXISTS idx_entidades_cbu 
ON public.entidades(cbu);

COMMIT;
