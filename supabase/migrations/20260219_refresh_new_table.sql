
-- Forzar refresco de caché en la nueva tabla
ALTER TABLE public.reglas_fiscales_ia ADD COLUMN if_exists_refresh TEXT;
ALTER TABLE public.reglas_fiscales_ia DROP COLUMN if_exists_refresh;
