# 📖 Manual de Usuario: Importación de Datos en BiFlow (V6)

Bienvenido a BiFlow. Esta guía te enseñará el camino correcto para que el sistema audite tu flujo de caja con precisión total desde el primer segundo.

---

## � PASO 1: Carga de Maestros (Clientes y Proveedores)
**REGLA FUNDAMENTAL:** Antes de realizar cualquier importación de movimientos, BiFlow debe conocer a tus contrapartes. Sin esto, el sistema no podrá "tildar" quién te debe o a quién le pagaste.

1.  Dirígete a **"Configuración > Entidades"**.
2.  Pulsa el botón **"Importar Entidades"**.
3.  Sube un archivo Excel/CSV con los CUITs y Razón Social de todos tus clientes y proveedores habituales.

> [!TIP]
> **Superpoder: Corrección en Vivo (Inline Fix).** Si al subir el archivo detectas un CUIT erróneo, **puedes editarlo directamente en la tabla de previsualización**. BiFlow validará el Módulo 11 en tiempo real para que la fila pase a "OK" sin que tengas que volver a editar tu Excel.

---

## 🚀 PASO 2: Acceder al Módulo de Carga
Tienes dos formas de cargar tus extractos:
1.  **Desde el Menú Lateral:** Selecciona **"Carga de Documentos"** (ícono de nube).
2.  **Atajo desde Bancos:** En **"Bancos > Resumen"**, verás un botón de **"Carga de Extracto"** que te permite subir el archivo directamente sin salir del módulo.

## 📋 PASO 3: Uso de Plantillas y Formatos No Reconocidos
Para asegurar el 100% de reconocimiento:
1.  **Plantillas Oficiales:** Descarga las plantillas mediante los botones **"Descargar Plantilla"**.
2.  **Constructor de Formatos Manuales:** Si tienes un extracto bancario de un banco antiguo o un formato muy específico que BiFlow no reconoce automáticamente, usa esta herramienta. 
    - *Nota: Solo es necesario usarlo si la detección inteligente falla.*

---

##  PASO 4: Preparar tus Archivos
**REGLA DE ORO DEL ORDEN:** Carga siempre en esta secuencia para que la IA pueda cruzar los datos correctamente:
1.  `ventas_ingresos.csv` y `compras_egresos.csv` (Tus facturas pendientes).
2.  `recibos.csv` y `ordenes_pago.csv` (Tu gestión de tesorería).
3.  **AL FINAL:** `extracto_bancario_columnas.csv` (La verdad del banco que lo cierra todo).

---

## 📥 PASO 5: El Proceso de Carga Masiva

### A. Carga de Facturación y Gestión
1.  Selecciona el área de **"Facturación e Ingresos"**.
2.  Sube los archivos de gestión mencionados en el paso anterior y pulsa **"Procesar Documentos"**.

### B. Carga del Extracto Bancario y "Entrenamiento"
¿Qué pasa si el formato del banco es nuevo?
1.  **Visor de Mapeo:** BiFlow te mostrará el contenido del extracto.
2.  **Entrenamiento:** Indica qué columna es Fecha, Concepto, Débito y Crédito.
3.  **Memoria:** Una vez confirmado, el sistema recordará este formato para siempre.

---

## ⚙️ PASO 6: Parámetros del "CFO Algorítmico"
En **"Configuración > Parámetros Financieros"**, ajusta los sensores de la IA:
- **TNA (Tasa Nominal Anual):** Pulsa **"AUTO (Mercado)"** para sincronizarte con el BCRA.
- **Colchón de Liquidez:** Define tu nivel de reserva; BiFlow te avisará antes de que lo perfores.
- **Saldos Iniciales:** Deben coincidir con tu Home Banking al momento de iniciar el uso.

### Auditoría IA e Inteligencia Anti-Fraude
1.  **Guardián Antifraude (TrustLedger):** BiFlow memoriza los CBUs históricos de tus proveedores. Si detecta un cambio sospechoso en una OP, lanzará una alerta de **"Posible Estafa BEC"**.
2.  **Entrenamiento de Impuestos:** Marca conceptos como "Percepción IVA" y el sistema aprenderá a generar reportes de crédito fiscal automáticamente.

---

## � PASO 7: Dashboard V4 y Conciliación
Tras la carga, observa los resultados:
1.  **Conciliación Automática:** Cruce exacto por monto y CUIT.
2.  **Conciliación Asistida (1-Clic):** Si hay diferencias de centavos, la IA te sugerirá el enlace más probable para que lo apruebes rápido.
3.  **La Triple Vista:** Tu Dashboard ahora se divide en:
    - **Panel Izquierdo:** Mesa de Control Bancaria.
    - **Panel Derecho Superior:** Ingresos (Verde).
    - **Panel Derecho Inferior:** Egresos (Rojo).

---
*BiFlow - Tu CFO Algorítmico.*
