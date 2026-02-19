
-- Force PostgREST cache refresh by doing a DDL change
ALTER TABLE public.configuracion_impuestos ADD COLUMN temp_refresh_col TEXT;
ALTER TABLE public.configuracion_impuestos DROP COLUMN temp_refresh_col;
