-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- 1. ORGANIZATIONS (Tenants)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'premium')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. ORGANIZATION_MEMBERS (User-Tenant Relation)
CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(organization_id, user_id)
);

-- 3. TRANSACCIONES (Core Financial Data)
CREATE TABLE transacciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    descripcion TEXT NOT NULL,
    monto DECIMAL(15, 2) NOT NULL,
    moneda TEXT DEFAULT 'ARS',
    cuit_origen TEXT,
    cuit_destino TEXT,
    categoria TEXT,
    tipo_comprobante TEXT, -- 'FACTURA', 'NOTA_CREDITO', etc.
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'conciliado', 'anulado')),
    origen_dato TEXT NOT NULL, -- 'interbanking', 'csv', 'manual'
    archivo_origen_id UUID, -- Link to processing_logs or files table if exists
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. HALLAZGOS (AI Findings / Leaks)
CREATE TABLE hallazgos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    transaccion_id UUID REFERENCES transacciones(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL, -- 'duplicado', 'fuga_fiscal', 'anomalia', 'recurrente'
    severidad TEXT DEFAULT 'low' CHECK (severidad IN ('low', 'medium', 'high', 'critical')),
    estado TEXT DEFAULT 'detectado' CHECK (estado IN ('detectado', 'resuelto', 'ignorado', 'falso_positivo')),
    monto_estimado_recupero DECIMAL(15, 2),
    detalle JSONB, -- AI explanation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. CUITS_CONOCIDOS (Reference Data for Recurrence)
CREATE TABLE cuits_conocidos (
    cuit TEXT PRIMARY KEY,
    razon_social TEXT,
    rubro TEXT,
    promedio_monto DECIMAL(15, 2),
    desvio_estandar DECIMAL(15, 2),
    frecuencia_dias INTEGER,
    ultima_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. NOTIFICACIONES (Realtime)
CREATE TABLE notificaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    leido BOOLEAN DEFAULT FALSE,
    tipo TEXT, -- 'info', 'warning', 'success', 'error'
    link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. PROCESSING_LOGS (System Metrics)
CREATE TABLE processing_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    archivo_nombre TEXT NOT NULL,
    estado TEXT DEFAULT 'procesando' CHECK (estado IN ('procesando', 'completado', 'error')),
    registros_totales INTEGER DEFAULT 0,
    registros_procesados INTEGER DEFAULT 0,
    tiempo_procesamiento_ms INTEGER,
    error_detalle TEXT,
    ai_tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. HUMAN_REVIEWS (Audit Trail)
CREATE TABLE human_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hallazgo_id UUID REFERENCES hallazgos(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accion_tomada TEXT NOT NULL, -- 'resolver', 'ignorar', etc.
    comentario TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. CSV_MAPEOS (User Configs)
CREATE TABLE csv_mapeos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    nombre_configuracion TEXT NOT NULL,
    mapeo_json JSONB NOT NULL, -- { "fecha": "Date", "monto": "Amount", ... }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE hallazgos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_mapeos ENABLE ROW LEVEL SECURITY;
-- cuits_conocidos is public reference data (read-only for most)
ALTER TABLE cuits_conocidos ENABLE ROW LEVEL SECURITY;


-- HELPER: Check if user is member of organization
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
    AND organization_id = org_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- POLICIES

-- Organizations: Users can view organizations they belong to
CREATE POLICY "Users can view own organizations" ON organizations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id = organizations.id
            AND user_id = auth.uid()
        )
    );

-- Organization Members: Users can view members of their organizations
CREATE POLICY "Users can view members of their organizations" ON organization_members
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
    );

-- Transacciones: View/Insert based on membership
CREATE POLICY "View transactions" ON transacciones
    FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "Insert transactions" ON transacciones
    FOR INSERT WITH CHECK (is_org_member(organization_id));

-- Hallazgos
CREATE POLICY "View findings" ON hallazgos
    FOR SELECT USING (is_org_member(organization_id));

-- Processing Logs
CREATE POLICY "View logs" ON processing_logs
    FOR SELECT USING (is_org_member(organization_id));

-- CSV Mapeos
CREATE POLICY "Manage mappings" ON csv_mapeos
    FOR ALL USING (is_org_member(organization_id));

-- Cuits Conocidos (Public Read, Admin Write)
CREATE POLICY "Public read cuits" ON cuits_conocidos
    FOR SELECT USING (true);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX idx_transacciones_org_fecha ON transacciones(organization_id, fecha);
CREATE INDEX idx_transacciones_cuit ON transacciones(cuit_origen, cuit_destino);
CREATE INDEX idx_hallazgos_org_status ON hallazgos(organization_id, estado);

-- ==========================================
-- VIEWS (Analytics)
-- ==========================================

CREATE OR REPLACE VIEW view_metrics_hallazgos AS
SELECT 
    organization_id,
    severidad,
    COUNT(*) as cantidad,
    SUM(COALESCE(monto_estimado_recupero, 0)) as total_recuperable
FROM hallazgos
GROUP BY organization_id, severidad;
