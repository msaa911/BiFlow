
-- Create table for storing custom file formats
create table if not exists formato_archivos (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references organizations(id) not null,
  nombre text not null, -- Name of the format (e.g. "Interbanking DAT")
  descripcion text,
  tipo text default 'fixed_width', -- 'fixed_width', 'csv', 'json', etc.
  reglas jsonb not null, -- Stores the parsing rules: { "fecha": [0,8], "monto": [30,42], ... }
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies
alter table formato_archivos enable row level security;

create policy "Users can view formats from their organization"
  on formato_archivos for select
  using (auth.uid() in (
    select user_id from organization_members
    where organization_id = formato_archivos.organization_id
  ));

create policy "Users can insert formats for their organization"
  on formato_archivos for insert
  with check (auth.uid() in (
    select user_id from organization_members
    where organization_id = formato_archivos.organization_id
  ));

create policy "Users can update formats for their organization"
  on formato_archivos for update
  using (auth.uid() in (
    select user_id from organization_members
    where organization_id = formato_archivos.organization_id
  ));

create policy "Users can delete formats for their organization"
  on formato_archivos for delete
  using (auth.uid() in (
    select user_id from organization_members
    where organization_id = formato_archivos.organization_id
  ));
