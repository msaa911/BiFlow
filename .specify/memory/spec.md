# Sprint 3: Pivot UX y Refinamiento del Flujo de Importación

## 1. Resumen
El Sprint 3 se enfoca en transformar la interfaz de usuario de BiFlow de una herramienta de gestión pasiva a un centro de acción proactivo ("Pivot UX"). Los dos pilares son:
1.  **Priorización de Movimientos:** El usuario debe aterrizar en sus tareas pendientes (conciliación) inmediatamente.
2.  **Fluidez en la Importación:** Reducir la fricción y mejorar la confianza durante el proceso de carga de datos mediante una validación visual y técnica superior.

---

## 2. Requerimientos Funcionales

### 2.1 Pivot UX (Dashboard)
*   **Pivot de Vista por Defecto:** Cambiar la pestaña activa por defecto de "Resumen" a una vista centrada en "Pendientes" (Movimientos previos no conciliados).
*   **Acceso "Nueva Carga":** Extraer la acción de importación del menú desplegable actual y posicionarla como un botón de acción primaria (CTA) de alta visibilidad en el encabezado de la sección de bancos.
*   **KPIs de Acción:** Mostrar contadores claros de "Movimientos por Conciliar" y "Monto Total Pendiente" en la parte superior para incentivar la acción.

### 2.2 Refinamiento de Importación
*   **Validación en Tiempo Real:** Mejorar el `ImportPreviewModal` para que los errores de validación (CUIT inválido, formato de fecha, etc.) se destaquen con micro-animaciones y descripciones claras.
*   **Feedback de Estado:** Implementar indicadores visuales por fila más granulares (Correcto, Advertencia, Error) con iconografía consistente.
*   **Edición con Debounce:** Optimizar la edición de filas en el modal para evitar re-validaciones excesivas durante la escritura (implementar un debounce de 300ms).

---

## 3. Componentes a Modificar

### 3.1 `components/dashboard/banks-tab.tsx` [MODIFICAR]
*   **Cambio:** Re-ordenar las pestañas y establecer `defaultValue="pending"` (o el identificador correspondiente al `UnreconciledPanel`).
*   **Cambio:** Implementar el botón "Nueva Carga" con un estilo premium (degradados, efectos de hover) fuera del menú secundario.

### 3.2 `components/dashboard/unreconciled-panel.tsx` [MODIFICAR]
*   **Cambio:** Ajustar el diseño para que funcione como contenido principal prioritario.
*   **Optimización:** Asegurar que las sugerencias de conciliación automática sean detectables a primera vista.

### 3.3 `components/dashboard/import-preview-modal.tsx` [MODIFICAR]
*   **Cambio:** Aplicar estética de "Glassmorphism" al modal para una apariencia más moderna.
*   **Cambio:** Mejorar la tabla de previsualización con indicadores de validez vibrantes.
*   **Cambio:** Refinar la lógica de validación reactiva para que sea más fluida.

---

## 4. Estética y Sistema de Diseño
Siguiendo la **Constitución de BiFlow**, se aplicarán los siguientes principios:
*   **Colores:** Uso de `emerald-500` para acciones positivas, `rose-500` para errores críticos, y fondos `gray-950` con transparencias sutiles.
*   **Tipografía:** Mantener la coherencia con el sistema actual, utilizando variaciones de peso (font-bold) para establecer una jerarquía clara.
*   **Efectos:** Resplandores (glow) en los bordes para campos con error y transiciones suaves (0.2s) en cambios de estado.

---

## 5. Constitución Técnica
*   **TypeScript:** Prohibido el uso de `any`. Todas las interfaces de datos de importación deben estar estrictamente tipadas.
*   **PostgreSQL RPC:** Toda lógica de persistencia masiva post-importación DEBE utilizar las funciones RPC optimizadas durante el Sprint 2.
*   **Rendimiento:** Implementar optimizaciones (como `React.memo`) en las filas de la tabla de previsualización para garantizar fluidez durante ediciones masivas.

---

## 6. Plan de Verificación
1.  **Navegación:** Al ingresar a la sección de un banco, el sistema debe posicionarse automáticamente en los movimientos pendientes.
2.  **Importación:** Cargar un archivo con CUITs inválidos y verificar que el modal impida la confirmación hasta que sean corregidos.
3.  **Responsive:** Validar que el nuevo botón "Nueva Carga" se adapte correctamente a dispositivos móviles y tablets.
