🗺️ Hoja de Ruta Completa y Planificación de BiFlow
Este documento detalla la evolución de BiFlow, desde sus cimientos hasta la visión de "CFO Algorítmico" completo. El proyecto se organiza en fases incrementales que van desde la captura técnica de datos hasta la inteligencia predictiva.

✅ Fase 1 a 3: Cimientos e infraestructura (100% COMPLETADO)
Esta fase se centró en sentar las bases técnicas y permitir la ingesta masiva de datos.

 Setup de Infraestructura: Configuración de Vercel y Supabase.
 Esquema de Datos Core: Diseño de tablas de transacciones, cuentas bancarias y organizaciones.
 Universal Translator (v1.0 - v6.0):
 Motor de traducción de archivos Excel/CSV/TXT.
 Reconocimiento automático de CUITs y normalización de conceptos.
 Soporte multi-banco con lógica de signos (+/-) inteligente.
 Auth & RLS: Sistema de autenticación con aislamiento total de datos entre empresas.
🚀 Fase 4: Inteligencia de Tesorería (Sprint 2) (100% COMPLETADO)
Enfoque en la gestión de capital y salud financiera diaria.

 Treasury Hub v2.0: Gestión de cuentas a pagar (AP) y cobrar (AR) con soporte para cheques y trazabilidad por comprobante.
 Motor de Liquidez:
 Cálculo de Runway (días de caja disponibles).
 Auditoría de Costo de Oportunidad (Dinero ocioso vs Plazo Fijo/BCRA).
 Stress Test de Saldo: Simulador interactivo que alerta si el pago de un lote de facturas genera un descubierto bancario.
 AI Advisor (MVP): Chat inteligente que responde sobre saldos, ingresos y variaciones mensuales.
🧠 Fase 5: Auditoría, Seguridad y Anti-Fraude (PRÓXIMOS PASOS)
Fase actual en refinamiento y despliegue final.

Anomaly Engine Avanzado:
 Detección de duplicados en ventana de 30 días.
 Alertas de sobreprecio (>15% de desvío histórico).
 Reconciliación Automática (Auto-Match): Cruce automático de facturas vs movimientos bancarios mediante lógica de CUIT + Monto.
Trust Ledger (BEC Protection):
 Extracción automática de 22 dígitos (CBU/CVU) de los archivos.
 Validación histórica de CBUs por proveedor para alertar cambios sospechosos y prevenir estafas.
 Tax Intelligence: Detección automática de retenciones recuperables de AFIP y ARBA.
📂 Fase 6: Memoria de Datos y Visual Mapper (EN DESARROLLO)
Optimización de la experiencia del usuario (UX) para acelerar la carga de datos.

 Visual Column Mapper: Interfaz Drag & Drop para que el usuario mapee manualmente archivos con formatos desconocidos por primera vez.
 Memoria de Huella Digital: El sistema recordará formatos anteriores y los procesará sin intervención humana.
 Excel Sync Loop (Diff Engine): Motor que detecta cambios específicos al volver a subir un archivo editado, evitando duplicidad de registros.
📊 Fase 7: Ecosistema "CFO 360°" y Expansión (PLANIFICADO)
Visión a largo plazo para convertir BiFlow en el sistema nervioso financiero de la empresa.

 Integración Nativa ERP: Conexión vía API con Tango, SAP, Colppy y Bejerman para automatizar la carga de facturas.
 Alertas Mobile Push: Notificaciones directas al celular sobre caídas en la salud de caja o detección de fraudes críticos.
 Dashboard Inversor: Reportes automatizados listos para presentar ante bancos o inversores.
 Tax Action Center: Botón para generar archivos listos para importar en aplicativos de AFIP con las retenciones a recuperar.
Resumen de Estado:

Terminado: 65%
En Progreso: 15%
Pendiente: 20%