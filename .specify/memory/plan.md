# Plan Técnico: Arquitectura de Estabilidad & RPC (Sprint 2)

## 🧱 Arquitectura Multi-Capa

### 1. Capa de Datos (Supabase/Postgres)
- **Migración de RLS**: Revocar el permiso de `UPDATE` en columnas críticas para el rol `authenticated`.
- **Implementación de RPCs**:
    - `reconcile_v4_0`: Motor unificado con Subset Sum optimizado (limit 50) y Fuzzy Search integrado.
    - `update_transaction_status`: Función `SECURITY DEFINER` para mutaciones seguras.

### 2. Capa de Motores (`lib/`)
- **Refactorización de `ReconciliationEngine`**: Migrar de cliente ligero a orquestador de las nuevas RPCs.
- **Normalización**: Implementar `UniversalTranslator` en SQL para pre-procesar descripciones antes del match.

## 🗺️ Hoja de Ruta de Ejecución
1.  **Fase 1: SQL Foundation**
    - Activar extensiones (`pg_trgm`).
    - Crear índices GIN.
    - Implementar `reconcile_v4_0`.
2.  **Fase 2: Security Hardening**
    - Aplicar restricciones de RLS por columna.
    - Testear accesos denegados desde consola.
3.  **Fase 3: Integration**
    - Actualizar `reconciliation-engine.ts` para llamar a la v4.0.
    - Implementar logs de auditoría en cada llamada RPC.

## 🧪 Estrategia de Verificación
- **Pruebas de Carga**: Validar Subset Sum con lotes de 40 facturas.
- **Pruebas de Seguridad**: Intentar modificar `monto` desde el cliente y verificar el rebote por RLS.
- **Edge Cases**: Validar el Fuzzy Search con nombres truncados o con caracteres especiales.
