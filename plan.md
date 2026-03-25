# 📋 Plan de Diseño Técnico: Sprint 3 - BiFlow Frontend/UX

Este documento detalla la aproximación técnica para implementar las mejoras de performance y estética visual requeridas para el Sprint 3.

## 🕒 1. Implementación de Debounce (300ms) en `import-preview-modal.tsx`

**Objetivo:** Evitar re-renders costosos y validaciones innecesarias en cada pulsación de tecla durante la edición de datos importados.

- **Problema:** Actualmente, `handleFieldChange` activa `onRowUpdate(validateRow(updatedRow))` inmediatamente. En tablas con 100+ filas, esto degrada la experiencia del usuario (lag al escribir).
- **Aproximación Técnica:** 
    - Introducir un estado local `localValue` para el campo que se está editando.
    - Implementar un hook `useEffect` con un `setTimeout` de 300ms que dispare la validación y el guardado en el estado global solo al dejar de escribir.
    - Se usará la lógica de limpieza de efecto (`clearTimeout`) para reiniciar el debounce si el usuario sigue tecleando.

```typescript
// Lógica propuesta
const [localValue, setLocalValue] = useState(row[field]);
useEffect(() => {
    const handler = setTimeout(() => {
        onRowUpdate(validateRow({ ...row, [field]: localValue }));
    }, 300);
    return () => clearTimeout(handler);
}, [localValue]);
```

---

## 💎 2. Estilos Premium & Glassmorphism (Tailwind + Shadcn)

**Objetivo:** Transformar la interfaz en una herramienta financiera de élite con estética moderna y profundidad visual.

- **Utilidades de Tailwind CSS:**
    - **Efecto Glassmorphism:** Combinación de `bg-gray-950/60`, `backdrop-blur-xl` y `border-white/10`.
    - **Profundidad sutil:** Sombras personalizadas mediante `shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]`.
    - **Gradientes Premium:** Uso de `bg-gradient-to-br from-emerald-600 to-teal-800` para acciones primarias.
- **Componentes Shadcn UI:**
    - Refuerzo de `Dialog` y `Tabs` con bordes sutiles de color `border-emerald-500/20`.
    - Botones con efectos de "glow" en hover usando `shadow-emerald-500/20 shadow-lg transition-all duration-300`.

---

## 🏗️ 3. Reestructuración de `banks-tab.tsx`

**Objetivo:** Mejorar el flujo de trabajo de conciliación priorizando la vista de pendientes y facilitando la carga de datos.

- **Pivot de Pestaña por Defecto:**
    - Cambiar el estado inicial de `activeTab` de `'summary'` a `'reconciliation'` (Pestaña "Pendientes").
- **Integración del Botón "Nueva Carga":**
    - **Ubicación:** Extraer la acción de "Carga De Extracto" del menú desplegable actual y colocarla como un botón primario (`Button` de shadcn) a la derecha del selector de cuenta bancaria.
    - **Estilo:** Variante `"Action CTA"` con gradiente esmeralda para atraer la atención visual.
    - **Lógica:** Implementación directa al modal de carga sin interrupciones por menús secundarios innecesarios.

---

## 🚦 Plan de Verificación

### Pruebas Automatizadas
- [ ] Verificar que el debounce no interrumpa el foco del input durante la escritura rápida.
- [ ] Confirmar que las validaciones se ejecuten exactamente 300ms después del último cambio.

### Verificación Manual
- [ ] Inspección visual del efecto glassmorphism en dispositivos con diferentes capacidades de rendering.
- [ ] Validar que al cargar el dashboard, la vista activa sea efectivamente "Pendientes".
- [ ] Probar el botón "Nueva Carga" desde diferentes estados de la tabla.

---
_Nota: Tras la aprobación de este plan, se procederá a la implementación de los cambios en los archivos correspondientes._
