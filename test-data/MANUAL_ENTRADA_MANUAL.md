# ✍️ Manual de Usuario: Gestión Manual de Datos en BiFlow (V6)

Esta guía te enseña a administrar paso a paso tus finanzas manualmente, garantizando que el sistema tenga toda la inteligencia necesaria para auditarte.

---

## 📇 1. Alta de Clientes y Proveedores (Entidades)
**ESTE ES SIEMPRE EL PRIMER PASO.** Antes de cargar una factura o un pago, el sistema debe saber con quién estás operando.
1.  Ve a **"Configuración > Entidades"**.
2.  Haz clic en **"+ Nueva Entidad"**.
3.  Ingresa el **CUIT** y **Razón Social**. BiFlow guardará estos datos para auto-completar todas tus cargas futuras y monitorear la seguridad de sus cuentas bancarias.

---

## ✍️ 2. Carga de Ingresos y Facturación de Ventas
1.  Ve al módulo de **"Ingresos/Ventas"**.
2.  Haz clic en **"+ Nueva Factura de Venta"**.
3.  **Selecciona el Cliente** (que ya diste de alta en el paso 1).
4.  Define la **Fecha de Vencimiento** (Vital para proyecciones).
5.  Haz clic en **"Guardar"**.

> [!TIP]
> **Atajo Contado:** Si la venta ya se cobró, elige "Contado" para que BiFlow cierre el ciclo de caja automáticamente.

---

## 💰 3. Registro de Cobranzas (Recibos)
Registra el ingreso real de dinero:
1.  En la factura, pulsa **"Cobrar/Recibo"**.
2.  Si es **Cheque**, completa el número y banco. BiFlow lo enviará directo a tu **"Cartera de Valores"**.

---

## 📉 4. Carga de Egresos y Compras
1.  Ve a **"Gastos/Compras"** -> **"+ Nuevo Gasto"**.
2.  Selecciona el **Proveedor** y la **Fecha de Pago Pactada**.

---

## 💸 5. Pago a Proveedores (Órdenes de Pago)
1.  En el gasto pendiente, pulsa **"Pagar / Emitir OP"**.
2.  **Endoso de Terceros:** Puedes elegir un cheque de tu cartera para pagar la cuenta. BiFlow validará que no violes la normativa de endosos del BCRA.

---

## 🛡️ 6. El Guardián BCRA y Cartera de Cheques
En **"Bancos > Cartera de Valores"** puedes gestionar tus cheques:
1.  **Gestión de Rechazos:** Si un cheque viene devuelto, cárgalo como gasto bancario.
2.  **Guardián BCRA:** El sistema auditará la multa bajo la **Regla 6.5.1**. Si el banco te cobró de más, verás una alerta roja.

---

## 🏦 7. El Extracto Bancario (Cierre de Ciclo)
Aunque gestiones todo a mano, el paso final es subir tu extracto para que la IA audite que todo está en orden.
- **Acceso Directo:** Puedes subir tu extracto directamente desde la pestaña **"Bancos"** usando el botón **"Carga de Extracto"**.
- **Fusión Inteligente:** BiFlow tildará tus cargas manuales contra el banco sin duplicar nada.
- **Sugerencias 1-Clic:** Si hay diferencias de centavos entre lo que anotaste y el banco, la IA te sugerirá unirlas con un clic.

---

## 🤖 8. Auditoría IA y Configuración
1.  **TNA Automática:** En Configuración, pulsa **"AUTO"** para que el gráfico de liquidez use la tasa real de mercado.
2.  **Alerta BEC:** Si registras un pago a un CBU que no coincide con el historial del proveedor, la IA te advertirá sobre un posible fraude.

---

## 📊 9. Interpretando el Dashboard V4
Tu pantalla de inicio se organiza en la **Triple Vista**:
1.  **Panel Izquierdo:** Control de saldos y movimientos bancarios.
2.  **Panel Derecho Superior:** Ingresos (Cobros realizados).
3.  **Panel Derecho Inferior:** Egresos (Pagos realizados).

---
*BiFlow - Gestión Financiera con Visión de Futuro.*
