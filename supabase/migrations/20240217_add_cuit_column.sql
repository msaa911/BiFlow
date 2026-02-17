
-- Migration: Add missing CUIT column to transacciones
-- Date: 2024-02-17

alter table public.transacciones
add column if not exists cuit text;

-- Add index for performance on CUIT lookups
create index if not exists idx_transacciones_cuit on public.transacciones(cuit);
