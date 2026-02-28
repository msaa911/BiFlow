-- Migration: Update Trust Ledger for v3.0 Reconciliation
-- Date: 2024-02-28
-- Description: Refines get_trust_ledger to account for the new administrative circuit (Transactions -> Movements -> Applications -> Invoices).

CREATE OR REPLACE FUNCTION public.get_trust_ledger(org_id UUID)
RETURNS TABLE (cbu text, cuit text) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- Case 1: Legacy/Direct links
    SELECT 
        t.metadata->>'cbu' as cbu,
        c.cuit_socio as cuit
    FROM public.transacciones t
    INNER JOIN public.comprobantes c ON t.comprobante_id = c.id
    WHERE t.organization_id = org_id
      AND t.metadata->>'cbu' IS NOT NULL
      AND c.cuit_socio IS NOT NULL
      AND t.estado = 'conciliado'
    
    UNION
    
    -- Case 2: New Circuit (Trans -> Movement -> Application -> Invoice)
    SELECT 
        t.metadata->>'cbu' as cbu,
        c.cuit_socio as cuit
    FROM public.transacciones t
    INNER JOIN public.movimientos_tesoreria m ON t.movimiento_id = m.id
    INNER JOIN public.aplicaciones_pago a ON m.id = a.movimiento_id
    INNER JOIN public.comprobantes c ON a.comprobante_id = c.id
    WHERE t.organization_id = org_id
      AND t.metadata->>'cbu' IS NOT NULL
      AND c.cuit_socio IS NOT NULL
      AND t.estado = 'conciliado'
    
    GROUP BY 1, 2;
END;
$$;
