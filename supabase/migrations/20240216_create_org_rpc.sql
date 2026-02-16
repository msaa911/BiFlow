-- RPC: Create Organization Safely (Bypassing RLS Chicken-and-Egg)
-- This function handles the atomic creation of an organization AND the owner membership.
-- It runs as SECURITY DEFINER, meaning it bypasses RLS checks for the operations inside it.

create or replace function public.create_new_organization(org_name text)
returns uuid
language plpgsql
security definer -- Critical: Runs as superuser/owner, bypassing RLS
as $$
declare
  new_org_id uuid;
  current_user_id uuid;
begin
  -- Get current user (safe in Supabase)
  current_user_id := auth.uid();
  
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 1. Insert Organization
  insert into public.organizations (name, tier)
  values (org_name, 'free')
  returning id into new_org_id;

  -- 2. Insert Membership (Owner)
  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, current_user_id, 'owner');

  -- 3. Return ID
  return new_org_id;
end;
$$;
