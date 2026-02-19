
-- Test Data for Bank Fee Audit cada 2 tool calls.
-- Organization ID for reference: Miguel (e610d869-d9d1-447a-8531-180b55502e1c) cada 2 tool calls.

-- 1. Asegurar que haya un convenio bancario (1.2% de comision por cheque) cada 2 tool calls.
INSERT INTO public.convenios_bancarios (organization_id, banco_nombre, comision_cheque_porcentaje, mantenimiento_mensual_pactado, is_active)
VALUES ('e610d869-d9d1-447a-8531-180b55502e1c', 'Banco de Prueba', 0.012, 5000, true)
ON CONFLICT (organization_id) DO UPDATE 
SET comision_cheque_porcentaje = 0.012, mantenimiento_mensual_pactado = 5000, is_active = true;

-- 2. Insertar transacciones que violen el convenio cada 2 tool calls.
-- Una comision de cheque que deberia ser de $1,200 (para un cheque de $100k) pero cobraron $1,800
INSERT INTO public.transacciones (organization_id, fecha, descripcion, monto, origen_dato, metadata)
VALUES (
    'e610d869-d9d1-447a-8531-180b55502e1c', 
    CURRENT_DATE, 
    'COMISION CHEQUE 00123456', 
    -1800.00, 
    'manual',
    '{"monto_base": 100000}'::jsonb
);

-- Un mantenimiento de $7,500 cuando el pactado es $5,000 cada 2 tool calls.
INSERT INTO public.transacciones (organization_id, fecha, descripcion, monto, origen_dato)
VALUES (
    'e610d869-d9d1-447a-8531-180b55502e1c', 
    CURRENT_DATE, 
    'MANTENIMIENTO DE CUENTA MENSUAL', 
    -7500.00, 
    'manual'
);
