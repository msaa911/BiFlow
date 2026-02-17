
-- Migration: Cash Flow 360 Premium Features (Chat, Scenarios, Executive View)
-- Date: 2024-02-17

-- 1. Chat Infrastructure (AI Advisor)
create table if not exists public.chat_sessions (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  title text,
  context_data jsonb default '{}'::jsonb, -- Store active import_id, filters, etc.
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.chat_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb default '{}'::jsonb, -- Store citations, confidence scores, etc.
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Scenario Planning (Simulator)
create table if not exists public.cashflow_scenarios (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  base_date date,
  status text default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.scenario_versions (
  id uuid default gen_random_uuid() primary key,
  scenario_id uuid references public.cashflow_scenarios(id) on delete cascade not null,
  version_number int not null,
  modifications jsonb default '[]'::jsonb, -- Array of changes: [{ "action": "delay_payment", "tx_id": "...", "days": 5 }]
  computed_balance numeric,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(scenario_id, version_number)
);

-- 3. Executive Dashboard Cache (Materialized View for Performance)
-- Stores pre-calculated daily balances for instant retrieval
create table if not exists public.daily_cashflow_cache (
  organization_id uuid references public.organizations(id) on delete cascade not null,
  date date not null,
  balance_start numeric default 0,
  incoming numeric default 0,
  outgoing numeric default 0,
  balance_end numeric default 0,
  last_updated timestamp with time zone default timezone('utc'::text, now()),
  primary key (organization_id, date)
);

-- RLS Policies
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.cashflow_scenarios enable row level security;
alter table public.scenario_versions enable row level security;
alter table public.daily_cashflow_cache enable row level security;

-- Simple RLS: Users can see data from their organization
create policy "Users can view own org chat sessions" on public.chat_sessions
  for select using (auth.uid() in (select user_id from public.organization_members where organization_id = chat_sessions.organization_id));

create policy "Users can insert own org chat sessions" on public.chat_sessions
  for insert with check (auth.uid() in (select user_id from public.organization_members where organization_id = chat_sessions.organization_id));

create policy "Users can view own org messages" on public.chat_messages
  for select using (session_id in (select id from public.chat_sessions));

create policy "Users can insert own org messages" on public.chat_messages
  for insert with check (session_id in (select id from public.chat_sessions));

-- (Add similar policies for scenarios and cache as needed)
