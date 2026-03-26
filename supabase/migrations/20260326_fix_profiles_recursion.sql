-- Fix de recursión infinita en la tabla profiles
BEGIN;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        public.is_admin()
    );

COMMIT;
