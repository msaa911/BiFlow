
-- Migration: Add metadata support for Anomaly Detection
-- Date: 2024-02-16

alter table public.transacciones
add column if not exists metadata jsonb default '{}'::jsonb,
add column if not exists tags text[] default array[]::text[];

-- RPC to efficiently calculate historical averages
create or replace function get_historical_averages(
  p_org_id uuid,
  p_descriptions text[],
  p_months_back int default 3
)
returns table (
  descripcion text,
  avg_monto numeric,
  stddev_monto numeric,
  count_transacciones bigint
)
language sql
security definer
as $$
  select 
    descripcion,
    avg(monto) as avg_monto,
    stddev(monto) as stddev_monto,
    count(*) as count_transacciones
  from transacciones
  where 
    organization_id = p_org_id
    and descripcion = any(p_descriptions)
    and fecha >= (now() - (p_months_back || ' month')::interval)::date
  group by descripcion
  having count(*) >= 3; -- Only average if we have enough data points
$$;
