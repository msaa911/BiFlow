-- Migration: Add Category to Treasury Movements
-- Date: 2026-03-02
-- Description: Adds a category column to movimientos_tesoreria to support granular accounting categorization (fees, interest, etc.)

ALTER TABLE public.movimientos_tesoreria ADD COLUMN IF NOT EXISTS categoria text;

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_movimientos_categoria ON public.movimientos_tesoreria(categoria);
