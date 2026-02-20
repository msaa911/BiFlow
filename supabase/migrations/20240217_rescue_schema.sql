
-- Migration: Rescue Schema 3.0 (Immutable Unaccent Fix)
-- Date: 2024-02-17

-- 1. Ensure Unaccent Extension exists
create extension if not exists unaccent with schema public;

-- 2. Create Immutable Wrapper for Unaccent (Required for Generated Columns)
create or replace function public.immutable_unaccent(text)
returns text as $$
    select public.unaccent('public.unaccent', $1);
$$ language sql immutable parallel safe strict;

-- 3. Add Critical Columns (metadata, tags, cuit)
alter table public.transacciones add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.transacciones add column if not exists tags text[] default array[]::text[];
alter table public.transacciones add column if not exists cuit text;

-- 4. Add Generated Column using the Immutable Wrapper
-- We drop it first if it exists to avoid conflicts, then recreate it correctly
alter table public.transacciones drop column if exists descripcion_normalizada;

alter table public.transacciones 
add column descripcion_normalizada text 
generated always as (upper(public.immutable_unaccent(descripcion))) stored;

-- 5. Indexes
create index if not exists idx_transacciones_metadata on public.transacciones using gin (metadata);
create index if not exists idx_transacciones_tags on public.transacciones using gin (tags);
create index if not exists idx_transacciones_cuit on public.transacciones(cuit);
create index if not exists idx_transacciones_desc_norm on public.transacciones(descripcion_normalizada);
