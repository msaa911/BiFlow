-- Migration: Trust Ledger for Smart Reconciliation
-- Description: Creates a function to derive CBU -> CUIT mappings from history.

CREATE OR REPLACE FUNCTION public.get_trust_ledger(org_id UUID)
RETURNS TABLE (cbu text, cuit text) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.metadata->>'cbu' as cbu,
        c.cuit_socio as cuit
    FROM public.transacciones t
    INNER JOIN public.comprobantes c ON t.comprobante_id = c.id
    WHERE t.organization_id = org_id
      AND t.metadata->>'cbu' IS NOT NULL
      AND c.cuit_socio IS NOT NULL
      AND t.estado = 'conciliado'
    GROUP BY 1, 2;
END;
$$;
