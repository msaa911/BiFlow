-- Create score_historial table
CREATE TABLE IF NOT EXISTS score_historial (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    fecha DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_score_historial_org_fecha ON score_historial(organization_id, fecha DESC);

-- Unique constraint to avoid duplicate snapshots per day per organization
ALTER TABLE score_historial ADD CONSTRAINT unique_org_date UNIQUE (organization_id, fecha);
