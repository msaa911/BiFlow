-- Enable unaccent for better text normalization (e.g., 'crédito' -> 'credito')
create extension if not exists unaccent;

-- 1. Function to normalize descriptions
-- Removes numbers, special characters, and extra spaces.
-- Example: "Google Cloud 2023-10" -> "GOOGLE CLOUD"
create or replace function normalize_description(input_text text)
returns text as $$
begin
  if input_text is null then return ''; end if;
  
  -- Upper case, remove accents, remove non-letters/spaces, trim
  return trim(regexp_replace(upper(unaccent(input_text)), '[^A-Z\s]', '', 'g'));
end;
$$ language plpgsql immutable;

-- 2. Add Generated Column for performance (Optional but recommended for large datasets)
-- We will just use a functional index for now to avoid altering table structure too heavily immediately,
-- but a generated column is easier to query. Let's add it.
alter table public.transacciones 
add column if not exists descripcion_normalizada text 
generated always as (normalize_description(descripcion)) stored;

create index if not exists idx_transacciones_desc_norm 
on public.transacciones (descripcion_normalizada);

-- 3. RPC to check duplicates in batch
-- Receives a JSON array of candidates and returns indices of those that match existing data.
create or replace function check_potential_duplicates(
  p_candidates jsonb -- Array of objects: { "fecha": "YYYY-MM-DD", "monto": 123.45, "descripcion": "Text" }
)
returns table (
  candidate_idx int, -- Index in the input array (0-based)
  match_id uuid,     -- ID of the existing transaction found
  match_score text   -- 'high' (same date+amount+norm_desc)
)
language plpgsql
security definer
as $$
declare
  item jsonb;
  idx int := 0;
  norm_desc text;
  c_fecha date;
  c_monto numeric;
begin
  -- Temporary table to hold results
  create temp table if not exists temp_dupes (
    candidate_idx int,
    match_id uuid,
    match_score text
  ) on commit drop;

  -- Loop through items (Postgres 13+ has better jsonb iterators but this is safe)
  for item in select * from jsonb_array_elements(p_candidates)
  loop
    norm_desc := normalize_description(item->>'descripcion');
    c_fecha := (item->>'fecha')::date;
    c_monto := (item->>'monto')::numeric;

    -- Strict Fuzzy Match:
    -- Same Date AND Same Amount (tolerance 0.05) AND Same Normalized Description
    insert into temp_dupes
    select 
      idx,
      t.id,
      'high'
    from public.transacciones t
    where t.fecha = c_fecha
      and abs(t.monto - c_monto) < 0.05
      and t.descripcion_normalizada = norm_desc
    limit 1; -- Just need to know if ONE exists

    idx := idx + 1;
  end loop;

  return query select * from temp_dupes;
end;
$$;
