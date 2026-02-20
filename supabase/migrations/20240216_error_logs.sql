-- Migration: Create error_logs table for system monitoring
-- Date: 2024-02-16

create table if not exists public.error_logs (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id),
  nivel text check (nivel in ('info', 'warning', 'error', 'critical')),
  origen text not null, -- e.g., 'upload_api', 'background_job'
  mensaje text not null,
  stack_trace text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.error_logs enable row level security;

-- Allow authenticated users to insert errors (so APIs running as user can log)
create policy "Users can insert error logs"
  on public.error_logs for insert
  with check (auth.role() = 'authenticated');

-- Allow organization owners to view their own errors
create policy "Owners can view their org errors"
  on public.error_logs for select
  using (
    organization_id in (
      select organization_id from public.organization_members 
      where user_id = auth.uid()
    )
  );
