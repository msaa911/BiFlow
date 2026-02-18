-- Migration for Bank Fee Audit Module
-- Created: 2026-02-18

-- 1. Tabla de Convenios Bancarios (Lo que el usuario pactó con el banco)
CREATE TABLE IF NOT EXISTS public.convenios_bancarios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    banco_nombre TEXT NOT NULL,
    cbu_referencia TEXT, -- Para vincular con transacciones específicas si hay múltiples cuentas
    
    -- Parámetros de Comisiones
    mantenimiento_mensual_pactado NUMERIC DEFAULT 0,
    comision_cheque_porcentaje NUMERIC DEFAULT 0, -- Ej: 0.012 para 1.2%
    costo_por_cheque_fijo NUMERIC DEFAULT 0,
    
    -- Parámetros de Crédito/Descubierto
    tasa_descubierto_anual_pactada NUMERIC DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Tabla de Hallazgos de Auditoría (Diferencias detectadas)
CREATE TABLE IF NOT EXISTS public.hallazgos_auditoria (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    transaccion_id UUID REFERENCES public.transacciones(id) ON DELETE CASCADE,
    
    tipo_error TEXT CHECK (tipo_error IN ('COMISION_EXCEDIDA', 'CARGO_NO_PACTADO', 'TASA_FUERA_DE_RANGO')),
    monto_esperado NUMERIC,
    monto_real NUMERIC,
    diferencia NUMERIC,
    
    estado TEXT DEFAULT 'detectado' CHECK (estado IN ('detectado', 'reclamado', 'bonificado', 'ignorado')),
    notas_ia TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Habilitar Seguridad (RLS)
ALTER TABLE public.convenios_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hallazgos_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden gestionar sus convenios" 
ON public.convenios_bancarios 
FOR ALL 
USING (organization_id IN (SELECT get_user_organizations()));

CREATE POLICY "Usuarios pueden ver sus hallazgos" 
ON public.hallazgos_auditoria 
FOR ALL 
USING (organization_id IN (SELECT get_user_organizations()));

-- Index para performance
CREATE INDEX IF NOT EXISTS idx_hallazgos_org ON public.hallazgos_auditoria(organization_id);
CREATE INDEX IF NOT EXISTS idx_convenios_org ON public.convenios_bancarios(organization_id);
