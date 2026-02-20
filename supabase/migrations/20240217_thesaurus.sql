-- Create Financial Thesaurus Table
CREATE TABLE IF NOT EXISTS financial_thesaurus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_term TEXT NOT NULL UNIQUE,
    canonical_term TEXT NOT NULL,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    organization_id UUID REFERENCES organizations(id) -- Optional: for org-specific aliases
);

-- Enable RLS
ALTER TABLE financial_thesaurus ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow read for all members" ON financial_thesaurus
    FOR SELECT USING (
        organization_id IS NULL OR 
        organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
    );

-- Seed with common Argentine banking variations
INSERT INTO financial_thesaurus (raw_term, canonical_term, category) VALUES
('COM. MANT.', 'MANTENIMIENTO DE CUENTA', 'banking_commission'),
('COM.MANT.', 'MANTENIMIENTO DE CUENTA', 'banking_commission'),
('MANT. CTAS.', 'MANTENIMIENTO DE CUENTA', 'banking_commission'),
('COMISION MANTENIMIENTO', 'MANTENIMIENTO DE CUENTA', 'banking_commission'),
('TRANSF. RECIB.', 'TRANSFERENCIA RECIBIDA', 'transfer'),
('TFE.RECIBIDA', 'TRANSFERENCIA RECIBIDA', 'transfer'),
('TRF ENVIADA', 'TRANSFERENCIA ENVIADA', 'transfer'),
('PAGO A PROVEEDOR', 'PAGO PROVEEDORES', 'payment'),
('PAGO HABERES', 'PAGO SUELDOS', 'payroll'),
('IMP.LEY 25413', 'IMPUESTO DEEBITO/CREDITO', 'tax'),
('IMPUESTO LEY 25.413', 'IMPUESTO DEEBITO/CREDITO', 'tax'),
('RET.IIBB', 'RETENCION IIBB', 'tax'),
('PERC.IVA', 'PERCEPCION IVA', 'tax')
ON CONFLICT (raw_term) DO NOTHING;
