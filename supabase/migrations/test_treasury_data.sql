-- SEED: Treasury Hub Sample Data (AR & AP)
-- Based on User samples from Feb 19

-- CLEANUP (Optional, for testing)
-- DELETE FROM public.comprobantes WHERE razon_social_socio IN ('Ricardo Lopez S.A.', 'Impresiones Quantum S.R.L.');

-- 1. ACCOUNTS RECEIVABLE (Cuentas por Cobrar / Ventas)
INSERT INTO public.comprobantes (organization_id, tipo, numero, cuit_socio, razon_social_socio, fecha_emision, fecha_vencimiento, monto_total, monto_pendiente, estado, moneda)
SELECT 
    (SELECT id FROM organizations LIMIT 1), -- fallback to first org for testing
    'factura_venta',
    'FAC - 2323223',
    '30-71042147',
    'Ricardo Lopez S.A.',
    '2026-02-01',
    '2026-02-01',
    156436.00,
    0.00,
    'pagado',
    'ARS'
UNION ALL SELECT (SELECT id FROM organizations LIMIT 1), 'factura_venta', 'FAC - 2323224', '30-70787072', 'Alberto Fernandez S.A.', '2026-01-02', '2026-02-02', 88432.00, 0.00, 'pagado', 'ARS'
UNION ALL SELECT (SELECT id FROM organizations LIMIT 1), 'factura_venta', 'FAC - 2323225', '30-71203330', 'Sofia Martinez S.A.', '2026-01-02', '2026-02-03', 153380.00, 0.00, 'pagado', 'ARS'
UNION ALL SELECT (SELECT id FROM organizations LIMIT 1), 'factura_venta', 'FAC - 2323241', '30-70793835', 'Gabriel Sosa S.A.', '2026-01-07', '2026-02-19', 1058600.00, 1058600.00, 'pendiente', 'ARS'
UNION ALL SELECT (SELECT id FROM organizations LIMIT 1), 'factura_venta', 'FAC - 2323242', '30-71042147', 'Ricardo Lopez S.A.', '2026-01-07', '2026-02-20', 759375.00, 759375.00, 'pendiente', 'ARS';

-- 2. ACCOUNTS PAYABLE (Cuentas por Pagar / Compras)
INSERT INTO public.comprobantes (organization_id, tipo, numero, cuit_socio, razon_social_socio, fecha_emision, fecha_vencimiento, monto_total, monto_pendiente, estado, moneda)
SELECT 
    (SELECT id FROM organizations LIMIT 1),
    'factura_compra',
    'FAC-P-001',
    '30-71042147',
    'Impresiones Quantum S.R.L.',
    '2026-02-01',
    '2026-02-05',
    156436.00,
    0.00,
    'pagado',
    'ARS'
UNION ALL SELECT (SELECT id FROM organizations LIMIT 1), 'factura_compra', 'FAC-P-002', '30-70787072', 'Almacen Logistico Global', '2026-02-01', '2026-02-08', 88432.00, 0.00, 'pagado', 'ARS'
UNION ALL SELECT (SELECT id FROM organizations LIMIT 1), 'factura_compra', 'FAC-P-007', '30-70316957', 'Desarrollos Floresta S.R.L.', '2026-02-03', '2026-02-20', 50000.00, 50000.00, 'pendiente', 'ARS'
UNION ALL SELECT (SELECT id FROM organizations LIMIT 1), 'factura_compra', 'FAC-P-008', '30-71540082', 'CarPark Soluciones', '2026-02-03', '2026-02-22', 300000.00, 300000.00, 'pendiente', 'ARS';

-- Add a few from the large lists to fill the chart
INSERT INTO public.comprobantes (organization_id, tipo, numero, cuit_socio, razon_social_socio, fecha_emision, fecha_vencimiento, monto_total, monto_pendiente, estado, moneda)
VALUES 
((SELECT id FROM organizations LIMIT 1), 'factura_venta', 'FAC-V-BIG-1', '20-22391730', 'Fernando Ruiz S.A.', '2026-02-07', '2026-02-21', 633268.00, 633268.00, 'pendiente', 'ARS'),
((SELECT id FROM organizations LIMIT 1), 'factura_compra', 'FAC-P-BIG-1', '30-70793835', 'Redes Giga S.A.', '2026-02-07', '2026-02-21', 1058600.00, 1058600.00, 'pendiente', 'ARS');
