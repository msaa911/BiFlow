-- Migration: Create geo_argentina table for standardized location data
-- Date: 2026-02-22

CREATE TABLE IF NOT EXISTS public.geo_argentina (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    localidad TEXT NOT NULL,
    departamento TEXT,
    provincia TEXT NOT NULL,
    latitud DECIMAL(10, 8),
    longitud DECIMAL(11, 8),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast searching
CREATE INDEX IF NOT EXISTS idx_geo_search ON public.geo_argentina (localidad, provincia);

-- Enable RLS
ALTER TABLE public.geo_argentina ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read location data
CREATE POLICY "Public read access for geo data"
ON public.geo_argentina
FOR SELECT
TO authenticated
USING (true);
