
-- Migration: Fix Tax Rules Persistence and Reset
-- Adds missing RLS policies for DELETE and INSERT to allow users to manage their own rules.

-- 1. Ensure RLS is enabled
ALTER TABLE public.tax_intelligence_rules ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts if they were partially created
DROP POLICY IF EXISTS "Users can view tax config for their org" ON public.tax_intelligence_rules;
DROP POLICY IF EXISTS "Users can insert tax config for their org" ON public.tax_intelligence_rules;
DROP POLICY IF EXISTS "Users can update tax config for their org" ON public.tax_intelligence_rules;
DROP POLICY IF EXISTS "Users can delete tax config for their org" ON public.tax_intelligence_rules;
DROP POLICY IF EXISTS "Users can see rules for their org" ON public.tax_intelligence_rules;
DROP POLICY IF EXISTS "Users can update rules for their org" ON public.tax_intelligence_rules;
DROP POLICY IF EXISTS "Service role has full access" ON public.tax_intelligence_rules;

-- 3. Create clean, comprehensive policies
CREATE POLICY "Users can view rules for their org" ON public.tax_intelligence_rules
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM public.organization_members 
            WHERE organization_id = tax_intelligence_rules.organization_id
        )
    );

CREATE POLICY "Users can insert rules for their org" ON public.tax_intelligence_rules
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM public.organization_members 
            WHERE organization_id = tax_intelligence_rules.organization_id
        )
    );

CREATE POLICY "Users can update rules for their org" ON public.tax_intelligence_rules
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT user_id FROM public.organization_members 
            WHERE organization_id = tax_intelligence_rules.organization_id
        )
    );

CREATE POLICY "Users can delete rules for their org" ON public.tax_intelligence_rules
    FOR DELETE USING (
        auth.uid() IN (
            SELECT user_id FROM public.organization_members 
            WHERE organization_id = tax_intelligence_rules.organization_id
        )
    );

-- 4. Ensure service role always has access (for background analysis/purge)
CREATE POLICY "Service role has full access" ON public.tax_intelligence_rules
    FOR ALL USING (true);

-- 5. Notify PostgREST
NOTIFY pgrst, 'reload schema';
