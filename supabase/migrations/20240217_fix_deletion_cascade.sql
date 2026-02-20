
-- Migration: Fix Deletion Logic (Cascade)
-- Date: 2024-02-17

-- 1. Fix Foreign Key on 'transacciones'
-- Drop existing constraint (name might vary, so we try standard names or use IF EXISTS)
alter table public.transacciones 
drop constraint if exists transacciones_archivo_importacion_id_fkey;

alter table public.transacciones
add constraint transacciones_archivo_importacion_id_fkey
foreign key (archivo_importacion_id)
references public.archivos_importados(id)
on delete cascade;

-- 2. Fix Foreign Key on 'transacciones_revision' (Quarantine)
alter table public.transacciones_revision
drop constraint if exists transacciones_revision_archivo_importacion_id_fkey;

alter table public.transacciones_revision
add constraint transacciones_revision_archivo_importacion_id_fkey
foreign key (archivo_importacion_id)
references public.archivos_importados(id)
on delete cascade;

-- 3. Cleanup Orphaned Records (Just in case)
delete from public.transacciones 
where archivo_importacion_id is not null 
and archivo_importacion_id not in (select id from public.archivos_importados);

delete from public.transacciones_revision
where archivo_importacion_id is not null 
and archivo_importacion_id not in (select id from public.archivos_importados);
