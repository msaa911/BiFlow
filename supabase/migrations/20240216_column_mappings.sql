
-- Migration: Add Column Mapping support
-- Date: 2024-02-16

-- 1. Create table for storing column mappings per organization
create table if not exists public.mapeos_columnas (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) not null,
  nombre_configuracion text not null, -- e.g. "Banco Frances PDF", "Excel Proveedores"
  firma_archivo text, -- Optional hash of headers to auto-detect later
  mapeo jsonb not null, -- { "fecha": 0, "descripcion": 1, "monto": 3 } (indices) or column names
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable RLS
alter table public.mapeos_columnas enable row level security;

-- 3. Policy
create policy "Users can view their organization's mappings"
  on public.mapeos_columnas for select
  using ( organization_id in (select id from public.organizations where id = organization_id) );

create policy "Users can insert mappings"
  on public.mapeos_columnas for insert
  with check ( organization_id in (select id from public.organizations where id = organization_id) );
