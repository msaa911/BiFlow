# 🗺️ BiFlow: Plan General de Desarrollo (Fuente de Verdad)

Este documento es la **única fuente de verdad** del proyecto. Centraliza la visión macro, el estado actual de ejecución y la hoja de ruta a largo plazo.

---

## 📊 ESTADO GLOBAL DEL PROYECTO
- **Fase Actual:** `Sprint 2: Inteligencia & Liquidez` 🔵 **En curso**
- **Siguiente Hito:** `Estabilidad & Robustez (Post-Auditoría Mar-18)` 🔶 **Prioridad Inmediata**
- **Core de Negocio:** 🟢 Completado (Importación, Treasury AR/AP, Motores Básicos).

---

## 🚀 EJECUCIÓN ACTUAL (EL CAMPO DE BATALLA)

### 1. Refactorización de Estabilidad (Resultados Auditoría Mar-18) 🔶 **ALTA PRIORIDAD**
*Garantizar que el sistema no falle bajo carga y que los datos sean 100% íntegros.*
- [x] **Atomicidad SQL (RPC)**: Migrado el core de `matchAndReconcile` a PostgreSQL RPC (`reconcile_v3_1`). Incluye Fase Administrativa (Comprobantes) y Fase Bancaria.
- [x] **Tipado Estricto (TS)**: Erradicado el uso de `: any` en `ReconciliationEngine` y `admin.ts`.
- [ ] **Capa de Pruebas**: Implementar Vitest para validar algoritmos financieros (IVA, Inflación, Suma de Subconjuntos).
- [x] **Seguridad Admin**: Eliminado el fallback inseguro a `ANON_KEY` en `lib/supabase/admin.ts`.
- [x] **Optimización UI**: Refactorizado el selector de entidades en el preview de facturas con debounce y estado por fila.
- [x] **Seguridad del Entorno**: Eliminado fallback de `ANON_KEY` en el cliente administrativo para forzar errores explícitos.

### 2. Cierre de Sprint 2: Inteligencia de Conciliación 🔵 **EPIC ACTUAL**
- [x] **Conciliación Automática 2.0**: Match real entre Bancos y Comprobantes vía CUIT, Cheque y Referencia (Hecho en RPC v3.1).
- [x] **Trust Ledger**: Cruce CUIT vs CBU integrado en el motor de conciliación atómico.
- [ ] **Pivot UX en Panel**: 
    - Al clicar "Conciliar", mostrar *únicamente* Movimientos Previos (Recibos/OP huérfanos).
    - Botón explícito para crear Recibo/OP solo si el usuario olvidó cargarlos previamente.
- [ ] **UX de Importación**: Debouncing en búsquedas e independencia de estado por fila en el modal de previsualización.

---

## 🛠️ BACKLOG TÉCNICO & DEUDA
*Tareas menores y mantenimiento acumulado.*
- [ ] **Refinamiento de UI**: Actualización de navegación lateral (Sidebar) y layouts de tablas reactivas.
- [ ] **Persistencia de Impuestos**: Asegurar que las reglas de clasificación de impuestos en extractos sean 100% consistentes.
- [ ] **Validación de Notas**: Asegurar que Notas de Débito/Crédito Bancarias se emitan y limpien el balance correctamente.
    - [x] Renombrar "Ingresos" a "Créditos" y "Egresos" a "Débitos".
    - [x] Mejorar legibilidad de columna Banco.
    - [x] Corregir eliminación de notas y reversión de estado (funciona la eliminación).
    - [!] **BLOQUEADO**: Error de base de datos (Matched: 0) por RLS al intentar conciliar transacciones desde el panel.

---

## 📈 HOJA DE RUTA (ROADMAP 2026)

### Fase 3: Cash Flow Avanzado (Q2 2026)
- **Escenarios Dinámicos**: Simulador de pagos diferidos y cobros adelantados.
- **Asesor de IA (360°)**: Chat directo sobre riesgos de liquidez y proyecciones de caja.
- **Visual Mapper**: Interfaz Drag & Drop para mapeo manual de formatos desconocidos.

### Fase 4: SaaS & Monetización
- **Gestión de Equipos**: Invitaciones, roles (Admin/Member) y auditoría de accesos.
- **Fiscal & Legal**: Facturación automática AFIP y exportación de libros IVA.
- **Billing**: Integración con Mercado Pago / Stripe para cobro de suscripciones.

---

## 📄 HISTORIAL DE SESIONES (LOG)
<details>
<summary><b>Click para ver sesiones completadas</b></summary>

### SESIÓN Marzo 13 - Refinamiento de Conciliación
- **Objetivo:** Optimizar precisión del Match y usabilidad del panel.
- [x] Extracción agresiva de IDs de 4+ dígitos.
- [x] Limpieza de prefijos (`TRF-`, `CHQ-`) automática.
- [x] Prioridad visual de referencia en ámbar brillante.
- [x] Ocultamiento inmediato de transacciones conciliadas localmente.

### FASE 1 & 2 - Core & Importación
- [x] Universal Translator (Parsers para Macro, Galicia, Excel personalizado).
- [x] Treasury Engine v1.0 (AR/AP).
- [x] Detección de anomalías y alertas de precio.
</details>

---

## ⚙️ STACK TÉCNICO
- **Framework**: Next.js 14+ (App Router, SSR).
- **Backend**: Supabase (PostgreSQL, Auth, RLS).
- **Motores**: AnomalyEngine, LiquidityEngine, TrustLedger, ReconciliationEngine.
- **Infra**: Resend (Emails), Vitest (Tests en camino).
