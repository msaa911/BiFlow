# Guía de Testeo Integral BiFlow (CFO Algorítmico)

Sigue estos pasos para visualizar las alertas de fraude, liquidez y comisiones desde un entorno 100% limpio.

## 1. Limpieza de Base de Datos
Para que no haya interferencias de testeos anteriores y las alertas sean "puras":
1. Ve a tu consola de Supabase -> **SQL Editor**.
2. Copia y ejecuta el contenido de [clear-db-test-data.sql](file:///d:/proyecto-biflow/scripts/clear-db-test-data.sql).
   - *Este script vacía transacciones y movimientos pero mantiene tus Clientes/Proveedores.*

## 2. Preparación de Datos
1. (Opcional) Ajusta los valores en [config.json](file:///d:/proyecto-biflow/test_data/config.json) si quieres cambiar el saldo inicial o la comisión.
2. Abre una terminal y ejecuta:
   ```bash
   node scripts/generate-test-data-sprint2.js
   ```
   - *Esto actualizará los archivos CSV en la carpeta `/test_data`.*

## 3. Importación y Observación
En la aplicación BiFlow, realiza la importación en este orden:

### A. Carga de Gestión e Ingresos (Expectativa)
Importa `ventas_ingresos.csv`, `compras_egresos.csv`, `recibos.csv` y `ordenes_pago.csv`. 
- Esto registrará los ingresos proyectados (ventas), los compromisos de pago (compras), los cheques en cartera y las deudas que BiFlow espera que el banco cobre.

### B. Carga Bancaria (Realidad)
Importa `extracto_bancario_columnas.csv`.
- Al subir este archivo, BiFlow iniciará el cruce automático.

## 4. Qué buscar (Hallazgos de Auditoría)

### 🚩 Alerta de Fraude BEC
- Ve al visor de auditoría. El sistema marcará un **monto coincidente** pero un **destinatario erróneo** (el CBU `...0888`). Esta es tu prueba de defensa ante piratería de facturas.

### 📉 Alerta de Liquidez Crítica
- En el Dashboard, observa el día 20/02/2026. Al caer el pago de 12.5M de AFIP, verás cómo la línea de liquidez perfora el colchón de seguridad.

### 💸 Auditoría de Comisiones
- Verifica los desvíos financieros. BiFlow debería marcar que faltaba conciliar los gastos de mantenimiento y las comisiones de cheques que el banco debitó.

### 🔄 Trazabilidad de Cheques y Multas BCRA
- Busca el cheque de $533.594 que fue rechazado el 25/02. Abre su historial para ver la línea de tiempo completa: Registro -> Depósito -> Rechazo -> Multa.
- **Auditoría Legal:** Verifica si el sistema lanzó la alerta del **Guardián BCRA** si la multa excedió los límites de la Regla 6.5.1.

### 🪄 Conciliación Asistida (Lógica Difusa)
- En el Hub de Tesorería, busca transacciones con diferencias mínimas (centavos). 
- Valida que aparezca el widget de **"Sugerencias de Conciliación"** y prueba el enlace a **1-Clic**.

### 📡 TNA Automática (Inteligencia de Mercado)
- Ve a Configuración -> Parámetros Financieros.
- Pulsa el botón **"AUTO (Mercado)"**. El icono debe girar y traer la tasa real de **argentina-datos**. Guarda los cambios y verifica que el gráfico de Cash Flow se recalcule con la nueva tasa de costo de oportunidad.
