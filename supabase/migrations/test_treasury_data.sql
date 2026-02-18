
-- PRUEBA DEL TESORERO AI (Treasury Hub Test Set)
-- Reemplazar 'TU_ORG_ID' por el ID de tu organización (puedes verlo en la URL del dashboard)

-- 1. SALDO DE BASE ($200.000)
INSERT INTO public.transacciones (organization_id, fecha, descripcion, monto, origen_dato)
VALUES ('TU_ORG_ID', CURRENT_DATE - INTERVAL '1 day', 'SALDO INICIAL TEST', 200000, 'manual');

-- 2. CUENTAS POR COBRAR (Factura vencida de un cliente)
INSERT INTO public.comprobantes (organization_id, tipo, numero, cuit_socio, razon_social_socio, fecha_emision, fecha_vencimiento, monto_total, monto_pendiente, estado)
VALUES ('TU_ORG_ID', 'factura_venta', '0001-00000101', '30711111112', 'MUEBLES SUR S.A.', CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE - INTERVAL '2 days', 50000, 50000, 'pendiente');

-- 3. PAGOS PROYECTADOS (Compromisos para los próximos 7 días)
-- Escenario: Total a pagar = $230.000 vs Saldo = $200.000 -> GAP esperado de $30.000

INSERT INTO public.pagos_proyectados (organization_id, fecha_pago_proyectada, monto, descripcion, estado)
VALUES 
('TU_ORG_ID', CURRENT_DATE + INTERVAL '2 days', 150000, 'PAGO ALQUILER OFICINA', 'programado'),
('TU_ORG_ID', CURRENT_DATE + INTERVAL '4 days', 80000, 'PROVISIÓN SUELDOS Q2', 'programado');
