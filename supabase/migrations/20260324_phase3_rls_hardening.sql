-- Migration: Fase 3 - Hardening RLS (Blindaje)
-- Date: 2026-03-24
-- Author: BiFlow Agent
-- Description: Bloqueo de edición de columnas críticas desde el cliente (Apego a la Constitución).

BEGIN;

/* 
  1. Revocar Permisos a Nivel de Columna
  ---------------------------------------------------------
  Esto es más fuerte que RLS. Si el rol 'authenticated' (frontend) intenta hacer un
  UPDATE sobre estas columnas, Postgres rechazará la operación antes de evaluar políticas.
*/

-- Transacciones: Protegemos el núcleo financiero
REVOKE UPDATE (fecha, monto, moneda, estado, cuenta_id, cuit_destino) 
ON public.transacciones 
FROM authenticated;

-- Comprobantes: Protegemos la integridad de las facturas/recibos
REVOKE UPDATE (monto_total, moneda, organization_id, cuenta_id) 
ON public.comprobantes 
FROM authenticated;

-- Nota: Recordar que las funciones RPC (como reconcile_v4_0 y safe_update_transaction) 
-- se ejecutan como SECURITY DEFINER (dueño), por lo que ignoran estas revocaciones.


/* 
  2. Refactorización de Políticas RLS
  ---------------------------------------------------------
  Simplificamos y blindamos el acceso para evitar el error "Matched: 0" causado por
  políticas redundantes o mal configuradas.
*/

-- Limpiamos políticas antiguas de transacciones
DROP POLICY IF EXISTS "View transactions" ON public.transacciones;
DROP POLICY IF EXISTS "Insert transactions" ON public.transacciones;
DROP POLICY IF EXISTS "Update transactions" ON public.transacciones;
DROP POLICY IF EXISTS "Edit transactions" ON public.transacciones;

-- A. Lectura: Solo miembros de la organización
CREATE POLICY "RLS_Transacciones_Select" ON public.transacciones
FOR SELECT 
USING (public.is_org_member(organization_id));

-- B. Inserción: Solo para su propia organización
CREATE POLICY "RLS_Transacciones_Insert" ON public.transacciones
FOR INSERT 
WITH CHECK (public.is_org_member(organization_id));

-- C. Actualización: Solo para columnas NO CRÍTICAS (las críticas ya están revocadas arriba)
-- Permitimos editar descripción, categoría o etiquetas únicamente.
CREATE POLICY "RLS_Transacciones_Update_Limited" ON public.transacciones
FOR UPDATE 
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));


/* 
  3. Hardening de Cuentas Bancarias
  ---------------------------------------------------------
  Evitar que se cambie el saldo inicial o la moneda después de creada.
*/
REVOKE UPDATE (saldo_inicial, moneda, organization_id) 
ON public.cuentas_bancarias 
FROM authenticated;

COMMIT;
