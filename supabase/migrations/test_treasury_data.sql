
-- PRUEBA DEL TESORERO AI (Treasury Hub Test Set)
-- 1. SALDO DE BASE ($200.000)
-- ID de Organización: 5002ec69-f512-4b20-93a2-c400af2bea61

-- 1. SALDO DE BASE ($200.000)
INSERT INTO public.transacciones (organization_id, fecha, descripcion, monto, origen_dato)
VALUES ('5002ec69-f512-4b20-93a2-c400af2bea61', CURRENT_DATE - INTERVAL '1 day', 'SALDO INICIAL TEST', 200000, 'manual');

-- 2. CUENTAS POR COBRAR (Factura vencida de un cliente)
INSERT INTO public.comprobantes (organization_id, tipo, numero, cuit_socio, razon_social_socio, fecha_emision, fecha_vencimiento, monto_total, monto_pendiente, estado)
VALUES ('5002ec69-f512-4b20-93a2-c400af2bea61', 'factura_venta', '0001-00000101', '30711111112', 'MUEBLES SUR S.A.', CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE - INTERVAL '2 days', 50000, 50000, 'pendiente');

-- 3. PAGOS PROYECTADOS (Compromisos para los próximos 7 días)
INSERT INTO public.pagos_proyectados (organization_id, fecha_pago_proyectada, monto, descripcion, estado)
VALUES 
('5002ec69-f512-4b20-93a2-c400af2bea61', CURRENT_DATE + INTERVAL '2 days', 150000, 'PAGO ALQUILER OFICINA', 'programado'),
('5002ec69-f512-4b20-93a2-c400af2bea61', CURRENT_DATE + INTERVAL '4 days', 80000, 'PROVISIÓN SUELDOS Q2', 'programado');
