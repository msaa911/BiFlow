-- Migration: Trust Ledger for BEC Prevention (Anti-Fraude)
-- Date: 2026-02-18

CREATE TABLE IF NOT EXISTS public.trust_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    cuit TEXT NOT NULL,
    cbu TEXT NOT NULL,
    is_trusted BOOLEAN DEFAULT true,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(organization_id, cuit, cbu)
);

-- Enable RLS
ALTER TABLE public.trust_ledger ENABLE ROW LEVEL SECURITY;

-- Assuming get_user_organizations() exists or using standard check
CREATE POLICY "Users can see their trust ledger" ON public.trust_ledger
    FOR SELECT USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert trust ledger" ON public.trust_ledger
    FOR INSERT WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_trust_cuit ON public.trust_ledger(cuit);
CREATE INDEX IF NOT EXISTS idx_trust_org ON public.trust_ledger(organization_id);
