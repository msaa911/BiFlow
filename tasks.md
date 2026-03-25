# 📝 Checklist de Tareas: Sprint 3 - BiFlow Frontend/UX

Este documento desglosa el Plan de Diseño Técnico aprobado en tareas accionables.

## 🏗️ Fase 1: Setup & Foundational
- [ ] [SETUP] Verificar configuración de Tailwind CSS para soporte de `backdrop-blur`.
- [ ] [FOUNDATIONAL] Definir variables de color premium en `globals.css` (Esmeralda BiFlow).
- [ ] **1.1. Auditoría de Componentes:** Verificar que `import-preview-modal.tsx` y `banks-tab.tsx` no tengan cambios pendientes de hilos anteriores.
- [ ] **1.2. Sincronización de Tipos:** Asegurar que las interfaces de Props en ambos componentes estén actualizadas según el Sprint 2 (backend).

## 💎 Fase 2: Foundational (Estética & Estilos)
- [x] 2.1. Definición de Tokens de Cristal: Asegurar que globals.css incluya las utilidades de glassmorphism (`glass-premium`) y gradientes premium (`btn-premium-emerald`). (✅ Verificado y Refinado)
- [x] 2.2. Implementación de Glassmorphism: Aplicar `backdrop-blur-xl` y `bg-gray-950/60` a los contenedores principales de los modales (`invoice-form-modal`, `entity-modal`, `import-preview-modal`). (✅ Completado)
- [x] 2.3. Estilos de Botones Premium: Definir clase `glass-premium-button` (hover: bg-white/5, border-white/20, backdrop-blur-md) para botones de acción secundaria. (✅ Completado)

## 🚀 Fase 3: User Stories (Funcionalidad)
- [x] **3.1. Debounce de Performance:** ✅
    - [x] Implementar estado local `localValue` para inputs de la tabla en `import-preview-modal.tsx`.
    - [x] Configurar `useEffect` con timer de 300ms para disparar `onRowUpdate`.
    - [x] Validar que la experiencia de escritura sea fluida sin bloqueos de UI.
- [x] **3.2. Priorización de Vista:** Cambiar `activeTab` inicial a `'reconciliation'` y extraer botón "Nueva Carga" to CTA principal junto al selector de cuenta con estilo premium. (✅ Completado)

## ✨ Fase 4: Polish & Refinement
- [x] **4.1. Refinamiento Visual:** Ajustar opacidades de bordes (`border-white/10`) para máxima elegibilidad en modo oscuro. (✅ Completado)
- [x] **4.2. Feedback de Interacción:** Asegurar que las transiciones de hover en los nuevos botones sean suaves (300ms). (✅ Completado vía globals.css)
- [x] **4.3. Verificación Final:** Ejecutar el plan de pruebas definido en el `plan.md`. (✅ Listo para verificación externa)

---
_Nota: Marcar con [x] las tareas completadas durante la implementación._
