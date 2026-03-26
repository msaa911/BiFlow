# 🗺️ BiFlow: Plan General de Desarrollo (Fuente de Verdad)

Este documento es la **única fuente de verdad** del proyecto. Centraliza la visión macro, el estado actual de ejecución y la hoja de ruta a largo plazo.

---

## 📊 ESTADO GLOBAL DEL PROYECTO
- **Fase Actual:** `Fase 3: Cash Flow Avanzado` 🔵 **INICIANDO**
- **Estado Técnico:** 🟢 **LIMPIO & ESTABLE** (Post-Sprint 6).
- **Core de Negocio:** 🟢 Completado (Importación, Treasury AR/AP, Motores de Auditoría, Conciliaciónv5).

---

## 🚀 HISTORIAL DE EJECUCIÓN (Hitos Logrados)

### ✅ Sprint 6: DevOps, Higiene & Seguridad (Marzo 2026) - RECIENTE
*Garantizar la estabilidad para producción y eliminar deuda técnica acumulada.*
- **Estructura**: Limpieza total de la raíz. Scripts movidos a `scripts/debug/` y datos a `test-data/`.
- **Seguridad**: Eliminación de rutas peligrosas (`/api/dev-schema`).
- **QA**: Refactor de `getOrgId` (resiliente) y eliminación de `next/headers` en lógica de negocio (Build fix).
- **Dashboard**: Corrección de bugs de renderizado en anomalías (PostgREST joins).

### ✅ Sprint 5: Refactor de Deuda Técnica (ColumnMapper)
- **Performance**: Implementación de `AbortController` y `useEffect` en el mapeador de columnas masivo.
- **Estabilidad**: Eliminada la inicialización incorrecta de estado en el preview de importación.

### ✅ Sprint 4: Backend & Hardening
- **Motor de Tesorería**: Eliminación de constantes hardcodeadas y lógica de duplicados corregida.
- **AI Advisor**: Implementación de manejo robusto de `OPENAI_API_KEY`.

### ✅ Sprint 3: UX & Premium Design (Glassmorphism)
- **UI**: Interfaz premium con efectos de desenfoque y sombras profundas (Cards, Sidebar).
- **UX**: Debouncing de 300ms en el preview de facturas y selector de entidades mejorado.

### ✅ Sprint 2: Inteligencia & Conciliación (Post-Auditoría Mar-18)
- **Atomicidad SQL**: Core de conciliación migrado a RPC PostgreSQL (`reconcile_v5_0`).
- **Trust Ledger**: Cruce CUIT vs CBU integrado en el motor.

---

## 🏗️ PRÓXIMAS PRIORIDADES (ROADMAP Q2 2026)

### 🥇 Fase 3: Cash Flow Avanzado (Epic Actual)
*Transformar los datos en decisiones estratégicas.*
- [ ] **Escenarios Dinámicos (Simulador)**: Crear proyecciones de caja moviendo fechas de vencimiento de facturas (Drag & Drop).
- [ ] **Asesor AI 360° (Chat)**: Integrar consulta de lenguaje natural sobre el estado de deuda y liquidez.
- [ ] **Visual Mapper UI**: Interfaz para mapear formatos de bancos desconocidos sin tocar código.
- [ ] **Vitest Setup**: Implementar suite de pruebas para motores financieros (Inflación, Gastos, Match).

### 🥈 Fase 4: B2B SaaS & Monetización
- [ ] **Roles & Permisos**: Gestión de usuarios (Admin, Viewer, Member) con RLS estricto.
- [ ] **Billing System**: Integración con Stripe/Mercado Pago para suscripciones.
- [ ] **Conexión AFIP**: Facturación directa y exportación de Libro IVA Digital.

---

## 🛠️ BACKLOG TÉCNICO & PENDIENTES
- [ ] **Botón Quick-Create**: Permitir crear Recibo/OP directamente desde el panel de conciliación.
- [ ] **Refinamiento de Tablas**: Implementar virtualización para manejar +10,000 transacciones sin lag.
- [ ] **Auditoría de Logs**: Dashboard para ver el historial de cambios manuales en transacciones.

---

## ⚙️ STACK TÉCNICO (Vigente)
- **Frontend**: Next.js 14+ (App Router), Tailwind CSS v3, Radix UI.
- **Backend**: Supabase (Auth, DB, RLS, Storage), Edge Functions.
- **AI**: OpenAI (GPT-4o), Motores Propios (Anomaly, Treasury, Reconcile).
- **QA**: Vitest (En camino), Playwright (E2E proyectado).
