-- SCRIPT DE LIMPIEZA DE DATOS (BiFlow Test Environment)
-- Ejecutar en el Editor SQL de Supabase antes de una importación limpia.

-- Desactivar triggers temporalmente para evitar logs de auditoría durante la limpieza
SET session_replication_role = 'replica';

-- Truncar tablas en orden de dependencia (Hijos -> Padres)
TRUNCATE TABLE 
    public.conciliaciones,
    public.transacciones,
    public.instrumentos_pago_historial,
    public.instrumentos_pago,
    public.movimientos_tesoreria
RESTART IDENTITY CASCADE;

-- Reactivar triggers
SET session_replication_role = 'origin';

-- Nota: Esto NO borra la configuración de la empresa ni los maestros de Clientes/Proveedores.
