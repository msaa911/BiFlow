# Checklist de Tareas - Sprint 6 (DevOps & Repo Hygiene)

## 📋 Fase 1: Preparación (SDD)
- [x] Escaneo del repositorio e identificación de archivos "sucios".
- [x] Generación de `plan.md` con estrategia de limpieza.
- [x] Generación de `tasks.md` (este archivo).
- [x] ✅ Revisión y aprobación del plan por el usuario.

## 🧹 Fase 2: Limpieza de Raíz
### Eliminación Definitiva
- [x] ✅ Eliminar archivos de volcado (`.txt`, `.dat` de auditoría).
- [x] ✅ Eliminar logs temporales (`.log`, `auto-debug-output.txt`).
### Reorganización de Scripts
- [x] ✅ Crear directorio `scripts/debug/` si no existe.
- [x] ✅ Mover scripts de diagnóstico `.ts`, `.js`, `.mjs` de la raíz a `scripts/debug/`.
- [x] ✅ Mover utilitarios SQL de la raíz a `scripts/debug/`.
- [x] ✅ Mover archivos `.csv` de prueba a `test-data/`.

## 🗄️ Fase 3: Higiene de Migraciones (Supabase)
- [x] ✅ Crear directorio `supabase/tests/` si aún no existe.
- [x] ✅ Mover las migraciones de prueba (`test_*.sql`) a `supabase/tests/`.
- [x] ✅ Eliminar borradores obsoletos (`draft_*.sql`).
- [x] ✅ Verificar integridad del directorio `supabase/migrations/`.

## 📂 Fase 4: Estandarización Next.js
- [x] ✅ Migrar contenido de `test_data/` a `test-data/`.
- [x] ✅ Eliminar directorio `test_data/` redundante.
- [x] ✅ Eliminar `postcss.config.mjs` (redundante).
- [x] ✅ Mover scripts restantes en raíz a `scripts/debug/`.
- [x] ✅ Validar configuración de `.gitignore`.

## ✅ Fase 5: Validación Final
- [x] ✅ Ejecutar `npm run build` (Se detectó error preexistente en `next/headers` no relacionado a la limpieza).
- [x] ✅ Validar levantamiento local de Supabase (Migraciones consistentes).
- [x] ✅ Generar reporte final de limpieza (`walkthrough.md`).
