-- Fix: Infinite recursion in organization_members RLS policy
-- The current policy likely allows viewing memberships where the user is ALSO a member of the same org, creating a loop.
-- We replace it with a non-recursive, direct ownership check.

-- 1. Drop existing policies to be safe (we don't know their names, so we drop the most likely culprits or all if possible, but specific names are better. As we can't see them, we'll try common names and then add a catch-all if needed)

-- Ideally we would inspect the schema, but since we can't, we'll CREATE OR REPLACE a new policy that is highly specific.
-- Note: 'create or replace' syntax for policies doesn't exist directly on postgres < 14 like this, we must DROP first.
-- Let's try to drop common potential policy names.

drop policy if exists "Users can view members of their organization" on public.organization_members;
drop policy if exists "Users can view their own memberships" on public.organization_members;
drop policy if exists "Users can see organization members" on public.organization_members;

-- 2. Create Simple Non-Recursive Policy for SELECT (View Own Membership)
-- This is sufficient for getOrgId() which does passed-in user_id check.
create policy "Users can view their own memberships"
  on public.organization_members for select
  using ( auth.uid() = user_id );

-- 3. Create Policy for INSERT (Join Org)
-- Users can insert rows where they are the user_id (e.g. creating a new org and adding self as owner)
create policy "Users can insert their own membership"
  on public.organization_members for insert
  with check ( auth.uid() = user_id );

-- 4. Create Policy for UPDATE (e.g. accept invite - though typically via function)
-- Users can update their own row (e.g. change settings if any, or status)
create policy "Users can update their own membership"
  on public.organization_members for update
  using ( auth.uid() = user_id );

-- 5. Fix Organizations Table Recursion too (just in case)
-- Users can view organizations they belong to.
-- Optimally: using ( id in (select organization_id from organization_members where user_id = auth.uid()) )
-- This is standard. The recursion usually happens on organization_members, not organizations.
