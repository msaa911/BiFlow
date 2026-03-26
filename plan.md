# Plan de Limpieza y Estructura - Sprint 6 (BiFlow)

Este plan detalla las acciones para el Sprint final, enfocado en la higiene del repositorio, la consolidación de la base de datos y el cumplimiento de estándares de estructura.

## 🎯 Objetivos Principales

1. **Higiene del Root**: Eliminar archivos temporales de auditoría, logs y volcados de código que ensucian la raíz.
2. **Orden de Migraciones**: Limpiar el directorio de migraciones de Supabase de archivos de prueba y borradores.
3. **Estandarización**: Unificar carpetas de datos de prueba y asegurar que la estructura cumpla con las mejores prácticas de Next.js.

---

## 🛠️ Acciones Propuestas

### 1. Limpieza del Root (Archivos de Debug y Temporales)

#### [ELIMINAR] Archivos de Auditoría y Logs
Estos archivos son subproductos de procesos anteriores y ya no son necesarios:
- `BiFlow_Audit_Dump_20260305.txt`
- `BiFlow_Audit_Dump_20260305_v2.txt`
- `BiFlow_Mega_Audit.dat`
- `full_codebase_dump.txt`
- `sprint_3_dump.txt`
- `diagnosis.log`
- `diagnosis_output.txt`
- `auto-debug-output.txt`

#### [REUBICAR] Herramientas de Diagnóstico y Scripts
Mover a un nuevo directorio `scripts/debug/` para mantener la raíz limpia pero conservar las herramientas útiles:
- **TS/JS**: `check_rls.ts`, `check_specific_tx.ts`, `debug-dashboard.ts`, `debug_bank_notes.ts`, `deep_diagnose.js`, `diagnose.js`, `diagnose_errors.js`, `inspect_invoices.js`, `verify-treasury.js`, `test-advisor.ts`, `test-ai.mjs`.
- **SQL**: `check_columns.sql`, `check_rls.sql`, `fix_missing_table.sql`.

#### [REUBICAR] Datos de Prueba
Mover los archivos `.csv` sueltos de la raíz a la carpeta de test unificada:
- `test_extracto_anomalias.csv`
- `test_import.csv`
- `test_treasury.csv`

---

### 2. Consolidación de Base de Datos (Supabase)

#### [LIMPIAR] Migraciones
Eliminar o reubicar archivos que no forman parte del esquema de producción:
- **Mover a `supabase/tests/`**: `test_bank_audit.sql`, `test_treasury_data.sql`.
- **Eliminar**: `draft_reconcile_rpc_v3_1.sql` (borrador obsoleto).
- **Mantener**: Todas las migraciones numeradas (100+) se mantendrán por ahora para asegurar compatibilidad con entornos existentes, a menos que se requiera un "squash" explícito.

---

### 3. Estandarización de Carpetas (Next.js Standards)

#### [UNIFICAR] Datos de Prueba
Existen dos carpetas: `test_data` y `test-data`. 
- **Propuesta**: Mover el contenido de `test_data` a `test-data/` y eliminar `test_data/` para seguir la convención kebab-case predominante.

#### [LIMPIAR] Configuración de Estilos (PostCSS)
- **Eliminar**: `postcss.config.mjs`. El proyecto ya cuenta con `postcss.config.js` orientado a Tailwind v3. El archivo `.mjs` contiene referencias a v4 que no coinciden con las dependencias actuales.

#### [MANTENIMIENTO] Estructura Root y Git
- Asegurar que `.env.local` no se suba al control de versiones (verificar `.gitignore`).
- Eliminar `tsconfig.tsbuildinfo` de la raíz (ya está en `.gitignore`).
- Mover cualquier script JS/TS restante en la raíz a la carpeta `scripts/`.

---

## ✅ Plan de Verificación

1. **Build Check**: Ejecutar `npm run build` para asegurar que la reubicación de archivos no afecte las rutas de importación.
2. **Database Reset**: Ejecutar `supabase db reset` (en entorno local) para validar que el orden de las migraciones sigue siendo consistente tras la limpieza.
3. **Scan Final**: Realizar un `ls -R` final para validar que la raíz solo contiene archivos de configuración esenciales.
