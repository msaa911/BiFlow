-- Fix: Allow users to create organizations (since they are RLS blocked)
-- The error "new row violates row-level security policy for table organizations"
-- happens because we're calling .insert() on organizations but no policy allows it.

-- 1. Allow authenticated users to INSERT organizations
-- This is common for onboarding flows where user creates their own tenant.
drop policy if exists "Users can create organizations" on public.organizations;
create policy "Users can create organizations"
  on public.organizations for insert
  with check ( auth.role() = 'authenticated' );

-- 2. Allow users to SEE organizations they belong to
-- This is needed for .select().single() right after insert, and general usage.
-- We check organization_members.
drop policy if exists "Users can view own organization" on public.organizations;
create policy "Users can view own organization"
  on public.organizations for select
  using (
    id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

-- 3. Allow users to UPDATE their own organization
drop policy if exists "Users can update own organization" on public.organizations;
create policy "Users can update own organization"
  on public.organizations for update
  using (
    id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );
