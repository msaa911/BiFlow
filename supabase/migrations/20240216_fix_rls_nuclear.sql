-- NUCLEAR OPTION: Drop ALL policies on organization_members
-- This script uses a dynamic block to remove every single policy on this table,
-- regardless of its name, to guarantee we kill the recursion.

DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'organization_members' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.organization_members', pol.policyname);
    END LOOP;
END $$;

-- Now recreate only the SAFE policies

-- 1. View own membership
create policy "Users can view their own memberships"
  on public.organization_members for select
  using ( auth.uid() = user_id );

-- 2. Insert own membership (when joining/creating org)
create policy "Users can insert their own membership"
  on public.organization_members for insert
  with check ( auth.uid() = user_id );

-- 3. Update own membership
create policy "Users can update their own membership"
  on public.organization_members for update
  using ( auth.uid() = user_id );

-- 4. Delete own membership (leave org)
create policy "Users can delete their own membership"
  on public.organization_members for delete
  using ( auth.uid() = user_id );
