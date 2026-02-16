
-- Migration: Add Data Quarantine support
-- Date: 2024-02-16

-- 1. Create table for holding ambiguous transactions
create table if not exists public.transacciones_revision (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) not null,
  archivo_importacion_id uuid references public.archivos_importados(id), -- Optional link to source file
  datos_crudos jsonb, -- Raw row data for context
  motivo text, -- Why it's here: "Fecha inválida", "Monto 0", "Posible duplicado"
  
  -- Proposed values (editable by user before approval)
  fecha date,
  descripcion text,
  monto numeric,
  
  estado text default 'pendiente', -- 'pendiente', 'aprobado', 'rechazado'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable RLS
alter table public.transacciones_revision enable row level security;

-- 3. Policies
create policy "Users can view their organization's review items"
  on public.transacciones_revision for select
  using ( organization_id in (select id from public.organizations where id = organization_id) );

create policy "Users can update their review items"
  on public.transacciones_revision for update
  using ( organization_id in (select id from public.organizations where id = organization_id) );

create policy "Users can insert review items (via upload)"
  on public.transacciones_revision for insert
  with check ( organization_id in (select id from public.organizations where id = organization_id) );

create policy "Users can delete review items"
  on public.transacciones_revision for delete
  using ( organization_id in (select id from public.organizations where id = organization_id) );
