-- Migration: Add missing metadata column
-- Date: 2026-02-26

ALTER TABLE public.movimientos_tesoreria 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
