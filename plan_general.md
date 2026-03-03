# 🗺️ BiFlow: Hoja de Ruta de Desarrollo Consolidada (Fuente de Verdad)

Este documento es la **única fuente de verdad** del proyecto. Integra la visión macro de lanzamiento, el estado de los Sprints y las tareas inmediatas.

---

## 🏁 ESTADO DEL PROYECTO
- **Fase 1: Core & Estabilidad** 🟢 *Terminado*
- **Fase 2: Motor de Importación (Universal Translator)** 🟢 *Terminado*
- **Fase 3: Robustez Enterprise & Tesorería (AR/AP)** 🟢 *Terminado*
- **Sprint 2: Inteligencia & Liquidez** 🔵 **En curso (Cierre y Validación)**
- **Cash Flow Avanzado (Scenarios/AI)** 🟡 *Planificado*

---

## 📅 SPRINT 2: INTELIGENCIA & LIQUIDEZ (PRIORIDAD ACTUAL)

### Módulo 1: Core de Detección (Precisión) 🟢 COMPLETADO
- Ventanas dinámicas (+/- 30 días), Tesauro Financiero y Re-ensamblado Multilínea.

### Módulo 2: Liquidez y Tesorería 🟢 COMPLETADO
- Stress Test de saldo, Costo de Oportunidad y Rediseño Treasury Hub v2.0.

### Módulo 3: Seguridad y Conciliación (TRUST LEDGER) 🔵 EN CURSO
- [ ] **3.1 Conciliación Automática**: Match real entre Bancos y Comprobantes vía CUIT/Cheque.
- [ ] **3.2 Trust Ledger**: Validación CUIT vs CBU para prevención de fraudes (BEC).
- [ ] **3.3 Extracción de CBU**: Captura de 22 dígitos en parsers bancarios.

---

## 🛠️ PRÓXIMA SESIÓN (Mañana - Marzo 4)
- [ ] **Punto de Partida**: Cargar archivos desde cero para validar integraciones.
- [ ] **Test NDB/NCB**: Validar que las Notas Bancarias se emitan y dejen de estar "Pendientes".
- [ ] **Impuestos**: Verificar persistencia de reglas de impuestos en extractos.
- [ ] **UI Sidebar**: Actualizar navegación lateral.

---

## 📊 ROADMAP: CASH FLOW AVANZADO

### Fase 4 & 5: Memoria de Formatos (Q2 2026)
- **Plantillas & Huella Digital**: Reconocimiento automático de archivos conocidos.
- **Visual Mapper**: Interfaz Drag & Drop para mapeo manual de columnas desconocidas.

### Fase 6: The Diff-Engine (Executive View)
- **Motor de Diferencias**: Sincronización bidireccional entre Excel y BiFlow.
- **Asesor de Impacto (IA)**: Explicación de cómo los cambios manuales afectan la caja.

### Fase 7: AI Advisor & Escenarios
- **Scenario Planning**: Simulador de pagos diferidos, cobros adelantados y versiones de caja.
- **Chat Advisor (360°)**: Preguntas directas a la IA sobre liquidez y riesgos.

### Fase 8: Monetización & Multi-usuario (SaaS)
- **Gestión de Equipos**: Invitaciones por email, roles (Admin/Member) y auditoría de accesos.
- **Billing Automático**: Integración con Mercado Pago (Local) o Stripe (Global).
- **Facturación AFIP**: Generación automática de comprobantes legales y portal de descarga para clientes.
- **Lógica de Asientos (Seats)**: Cobro dinámico por usuario adicional a partir del 6to integrante.

---

## 📱 Fase 9: Ecosistema "Cash Flow 360°"
- Alertas Push móviles e integración directa con ERPs (Tango, Colppy, Bejerman).

---

## ⚙️ STACK TÉCNICO & INFRAESTRUCTURA
- **Frontend**: Next.js 14+ (App Router).
- **Backend**: Supabase (PG + Auth + RLS).
- **E-mails**: Resend (Invitaciones y alertas de cobro).
- **Pagos (Roadmap)**: Mercado Pago / Mobbex / Stripe.
- **Motores**: AnomalyEngine, LiquidityEngine, TrustLedger.
