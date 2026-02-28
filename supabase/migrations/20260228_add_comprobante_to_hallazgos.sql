-- Migration: Add comprobante_id to hallazgos and update metrics view
-- Date: 2026-02-28

-- 1. Add comprobante_id column to hallazgos
ALTER TABLE public.hallazgos 
ADD COLUMN IF NOT EXISTS comprobante_id UUID REFERENCES public.comprobantes(id) ON DELETE CASCADE;

-- 2. Add Index for performance
CREATE INDEX IF NOT EXISTS idx_hallazgos_comprobante ON public.hallazgos(comprobante_id);

-- 3. Update view_metrics_hallazgos to be more comprehensive
DROP VIEW IF EXISTS public.view_metrics_hallazgos;
CREATE OR REPLACE VIEW public.view_metrics_hallazgos AS
SELECT 
    organization_id,
    severidad,
    tipo,
    COUNT(*) as cantidad,
    SUM(COALESCE(monto_estimado_recupero, 0)) as total_recuperable
FROM public.hallazgos
WHERE estado = 'detectado'
GROUP BY organization_id, severidad, tipo;

-- 4. Helper function for Z-Score calculation (Internal use by analysis engine)
-- This computes the mean and standard deviation for a given category/org to identify outliers.
CREATE OR REPLACE FUNCTION get_stdev_by_category(p_org_id UUID, p_category TEXT)
RETURNS TABLE(avg_monto DECIMAL, std_monto DECIMAL, count_pos BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        AVG(ABS(monto))::DECIMAL,
        stddev(ABS(monto))::DECIMAL,
        COUNT(*)
    FROM transacciones
    WHERE organization_id = p_org_id 
    AND (metadata->>'categoria' = p_category OR categoria = p_category)
    AND monto < 0; -- Only expenses usually
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
