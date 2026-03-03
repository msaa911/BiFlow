-- RPC actualizado que permite pasar el user_id explícitamente o usar auth.uid()
create or replace function public.create_new_organization(org_name text, user_id_param uuid default null)
returns uuid
language plpgsql
security definer
as $$
declare
  new_org_id uuid;
  target_user_id uuid;
begin
  -- Determinar el user_id (parámetro o sesión)
  target_user_id := coalesce(user_id_param, auth.uid());
  
  if target_user_id is null then
    raise exception 'No user ID provided or authenticated';
  end if;

  -- 1. Insert Organization
  insert into public.organizations (name, tier)
  values (org_name, 'free')
  returning id into new_org_id;

  -- 2. Insert Membership (Owner)
  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, target_user_id, 'owner');

  -- 3. Return ID
  return new_org_id;
end;
$$;
