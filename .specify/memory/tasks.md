# Tareas: Estabilidad & Conciliación Atómica (Sprint 2)

Este documento desglosa el plan de implementación en tareas atómicas y secuenciales.

## 🏗️ Fase 1: Setup de Base de Datos
- [x] **1.1 Extensiones**: Activar `pg_trgm` y `unaccent` en la base de datos de Supabase.
- [x] **1.2 Índices GIN**: Crear índices GIN en `transacciones.descripcion` para optimizar Fuzzy Search.
- [x] **1.3 Integridad Referencial**: Reforzar FKs en `comprobantes` con `ON DELETE RESTRICT`.

## ⚙️ Fase 2: Funciones RPC de Conciliación
- [x] **2.1 Motor v4.0 (Core)**: Implementar `reconcile_v4_0` en PL/pgSQL.
- [x] **2.2 Algoritmo Subset Sum**: Programar búsqueda recursiva optimizada para lotes de hasta 50 elementos.
- [x] **2.3 Fuzzy Search GIN**: Integrar lógica `pg_trgm` en el flujo de matching (L3).
- [x] **2.4 Mutador Seguro**: Crear `safe_update_transaction` (SECURITY DEFINER) para bypass de RLS controlado.

## 🔐 Fase 3: Políticas RLS (Seguridad)
- [x] **3.1 Hardening de Columnas**: Ejecutar `REVOKE UPDATE` sobre columnas críticas (`monto`, `moneda`, `estado`, etc.) para el rol `authenticated`.
- [x] **3.2 Refactorización de Accesos**: Simplificar políticas de acceso por `organization_id` para eliminar redundancias.
- [x] **3.3 Validación de Bloqueo**: Testear manualmente que la edición directa de `estado` falle desde el cliente.

## ⚛️ Fase 4: Refactorización de TypeScript
- [x] **4.1 Engine Adapter**: Actualizar `lib/reconciliation-engine.ts` para orquestar las llamadas a la v4.0.
- [x] **4.2 Tipado Estricto**: Definir interfaces rigurosas para los balances y resultados devueltos por el RPC.
- [x] **4.3 Auditoría de Logs**: Implementar logging de métricas de performance (latencia del matching) en el cliente.

## ✅ Fase 5: Verificación
- [ ] **5.1 Prueba de Estrés**: Validar conciliación con lote real de 45-50 facturas.
- [ ] **5.2 Fix Verification**: Confirmar desaparición definitiva del error `Matched: 0`.

---
*Generado mediante el flujo /speckit.tasks*
*Fecha: 2026-03-24*
