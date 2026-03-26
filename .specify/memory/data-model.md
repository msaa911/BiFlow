# Modelo de Datos: Estabilidad & Conciliación (Sprint 2)

## 🏢 Tablas Críticas

### `transacciones`
- **Estado**: RLS debe bloquear `UPDATE` en: `monto`, `moneda`, `fecha_operacion`, `cuenta_id`, `estado`.
- **Nuevas Columnas/Indices GIN**:
    - `description_t_search`: (Opcional) Columna generada para `tsvector` para acelerar Fuzzy Search.
    - Índice GIN en `description` para `pg_trgm`.

### `comprobantes` (Facturas, Notas, Recibos)
- **Relaciones**: Fortalecer integridad referencial con `ON DELETE RESTRICT` para evitar huérfanos en auditoría.
- **Índices**: Índices compuestos en `(organization_id, cuit)` y `(organization_id, monto)`.

## 🛠️ Extensiones Requeridas
- `pg_trgm`: Para búsqueda difusa de nombres de entidades.
- `unaccent`: Para normalización de descripciones bancarias.

## 🔐 Políticas de RLS (Refactorización)
```sql
-- Ejemplo de política de blindaje
CREATE POLICY "Transacciones solo lectura para campos criticos"
ON transacciones
FOR UPDATE
USING (auth.uid() IN (SELECT user_id FROM miembros_org WHERE organization_id = transacciones.organization_id))
WITH CHECK (
  -- Impide cambios en columnas criticas si no es via RPC (simulado o via triggers)
  -- En la practica, se revocara el UPDATE directo en estas columnas para el rol 'authenticated'
);
```
