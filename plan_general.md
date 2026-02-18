# 🗺️ BiFlow: Hoja de Ruta de Desarrollo Consolidada

Este documento es la fuente de verdad del proyecto. Integra la visión macro de lanzamiento con el **Sprint 2: Inteligencia de Anomalías y Liquidez**.

---

## 🏁 ESTADO DEL PROYECTO
- **Fase 1: Core & Estabilidad** 🟢 *Terminado*
- **Fase 2: El Motor de Importación (Universal Translator)** 🟢 *Terminado*
- **Fase 3: Robustez Enterprise (Parsing 2.0)** 🟢 *Terminado* (Re-ensamblado multilínea incluido)
- **Fase 7: CFO Algorítmico (Motor de Anomalías)** 🔵 *En curso (Refinamiento)*
- **Fase 8: Dashboard de Salud de Caja** 🔵 *En curso (Visión Pro)*

---

## 📅 PLAN DETALLADO POR FASES

### ✅ Fase 1 a 3: Cimientos (COMPLETADO)
- Setup Infraestructura, Supabase y Auth.
- Soporte Excel/CSV/TXT con lógica de signos.
- Extractor de CUITs y detector de separadores.

### 🧠 SPRINT 2: Inteligencia & Liquidez (PRIORIDAD ACTUAL)
*Este sprint cierra la brecha entre el motor actual y la promesa de la IA.*

#### Módulo 1: CORE DE DETECCIÓN (Precisión) 🟢 COMPLETADO & AUDITADO
- [x] **1.1 Ventanas Dinámicas:** Detección de duplicados en +/- 30 días (Sincronizado en Engine).
- [x] **1.2 Tesauro Financiero:** Normalización semántica de conceptos bancarios (Setup SQL operativo).
- [x] **1.3 Re-ensamblado Multilínea:** "Pegado" de descripciones fragmentadas (Implementado).

#### Módulo 2: MOTOR DE LIQUIDEZ (Money Maker) 🔵 EN CURSO
- [x] **2.1 Stress Test:** Simulador de saldo post-lote y alertas de descubierto (Implementado).
- [/] **2.2 Costo de Oportunidad:** Dinero ocioso vs tasas de mercado (Configuración TNA lista).
- [ ] **2.3 Auditoría de Acuerdos:** Validación de tarifas bancarias pactadas vs cobradas.

#### Módulo 3: SEGURIDAD Y ANTI-FRAUDE (Trust Ledger)
- [ ] **3.1 Extracción de CBU:** Captura de 22 dígitos en parsers.
- [ ] **3.2 Trust Ledger:** Validación CUIT vs CBU para prevenir fraude (BEC).

---

## 🚀 HOJA DE RUTA FUTURA (Próximos Pasos)

### 📂 Fase 4 & 5: Memoria de Formatos
- **Plantillas & Memoria:** Reconocimiento de archivos por "huella digital".
- **Visual Mapper:** Interfaz Drag & Drop para mapear columnas desconocidas.

### 📊 Fase 6: Excel Sync Loop (The Diff-Engine)
- **Motor de Diferencias:** Detectar cambios al re-subir un Excel editado.
- **Asesor de Impacto:** IA que explica cómo los cambios afectan la caja.

### 🧪 Fase 7.5: Validación & Stress Testing
- Pruebas de carga con 500+ transacciones reales.
- Auditoría cruzada saldo BiFlow vs Extracto bancario.

### 📱 Fase 9: Ecosistema "Cash Flow 360°"
- Alertas Push (Mobile) sobre eficiencia financiera.
- Integración con ERPs (Tango, Colppy, Bejerman).

---

## 🛠️ STACK TÉCNICO
- **Frontend:** Next.js 14 (App Router).
- **Backend:** Supabase (PG + Auth + RLS).
- **Motores:** AnomalyEngine, LiquidityEngine (NEW), TrustLedger (NEW).
