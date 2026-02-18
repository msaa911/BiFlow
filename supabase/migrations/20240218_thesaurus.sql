-- Tabla de Tesauro Financiero para normalización semántica
CREATE TABLE IF NOT EXISTS financial_thesaurus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_pattern TEXT UNIQUE NOT NULL, -- El texto "sucio" que viene del banco
    normalized_concept TEXT NOT NULL,  -- El texto "limpio" y unificado
    category TEXT,                     -- Opcional: Impuestos, Comisiones, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE financial_thesaurus ENABLE ROW LEVEL SECURITY;

-- Política de lectura para todos los usuarios autenticados (es una tabla global de referencia)
CREATE POLICY "Allow public read for thesaurus" ON financial_thesaurus
    FOR SELECT USING (true);

-- Datos iniciales (Seed)
INSERT INTO financial_thesaurus (raw_pattern, normalized_concept, category) VALUES
('COM. MANT.', 'MANTENIMIENTO DE CUENTA', 'COMISION'),
('COM.MANT.', 'MANTENIMIENTO DE CUENTA', 'COMISION'),
('COMISION MANTENIMIENTO', 'MANTENIMIENTO DE CUENTA', 'COMISION'),
('MANT. CTAS.CTE', 'MANTENIMIENTO DE CUENTA', 'COMISION'),
('IMP.LEY 25413', 'IMPUESTO DEBITOS/CREDITOS', 'IMPUESTO'),
('IMPUESTO LEY 25.413', 'IMPUESTO DEBITOS/CREDITOS', 'IMPUESTO'),
('SIRCREB', 'RETENCION IIBB SIRCREB', 'RETENCION'),
('MP *', 'MERCADO PAGO', 'TRANSFERENCIA'),
('MERCADOPAGO', 'MERCADO PAGO', 'TRANSFERENCIA'),
('CAJA AHORRO', 'MOVIMIENTO CAJA AHORRO', 'OPERATIVO'),
('IVA COMISIONES', 'IVA SOBRE COMISIONES', 'IMPUESTO'),
('DB.RE.IIBB', 'RETENCION IIBB', 'RETENCION'),
('AJUSTE', 'AJUSTE DE SALDO', 'AJUSTE')
ON CONFLICT (raw_pattern) DO NOTHING;
