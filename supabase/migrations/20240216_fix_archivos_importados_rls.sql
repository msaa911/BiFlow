-- Fix: Add missing RLS policies for archivos_importados
-- This table was missing INSERT and UPDATE permissions, causing uploads to fail.

-- 1. Allow INSERT (for creating the log 'procesando')
create policy "Users can insert their own import logs"
  on public.archivos_importados for insert
  with check ( 
    auth.uid() in (
      select user_id from public.organization_members 
      where organization_id = archivos_importados.organization_id
    )
  );

-- 2. Allow UPDATE (for marking as 'completado' or 'error')
create policy "Users can update their own import logs"
  on public.archivos_importados for update
  using ( 
    auth.uid() in (
      select user_id from public.organization_members 
      where organization_id = archivos_importados.organization_id
    )
  );

-- 3. Update SELECT to use secure auth check (optional but recommended)
-- drop policy if exists "Users can view their organization's imported files" on public.archivos_importados;
-- create policy "Users can view their organization's imported files"
--   on public.archivos_importados for select
--   using ( 
--     auth.uid() in (
--       select user_id from public.organization_members 
--       where organization_id = archivos_importados.organization_id
--     )
--   );
