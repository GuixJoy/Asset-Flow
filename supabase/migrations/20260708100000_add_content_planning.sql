begin;

-- ============================================================
-- 1a. Create service_cycles table
-- ============================================================

create type public.cycle_status as enum ('upcoming', 'active', 'completed', 'cancelled');

create table if not exists public.service_cycles (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  reels_target    integer not null default 0,
  posters_target  integer not null default 0,
  status          public.cycle_status not null default 'upcoming',
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint valid_dates check (end_date >= start_date)
);

-- Enforce ONE active cycle per client at the database level
create unique index if not exists idx_one_active_cycle_per_client
  on public.service_cycles (client_id)
  where status = 'active';

-- ============================================================
-- 1b. Create content_plans table
-- ============================================================

create table if not exists public.content_plans (
  id              uuid primary key default gen_random_uuid(),
  cycle_id        uuid not null references public.service_cycles(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  week_number     integer not null,
  week_start      date not null,
  week_end        date not null,
  planned_reels   integer not null default 0,
  planned_posters integer not null default 0,
  created_at      timestamptz not null default now(),

  constraint unique_week_per_cycle unique (cycle_id, week_number)
);

-- ============================================================
-- 1c. Create service_cycle_sequences table (monotonic numbering)
-- ============================================================

create table if not exists public.service_cycle_sequences (
  cycle_id    uuid not null references public.service_cycles(id) on delete cascade,
  asset_type  public.asset_type not null,
  next_number integer not null default 1,

  primary key (cycle_id, asset_type)
);

-- ============================================================
-- 1d. Add cycle_id and asset_number to content_assets
-- ============================================================

alter table public.content_assets
  add column if not exists cycle_id uuid references public.service_cycles(id) on delete set null,
  add column if not exists asset_number integer;

create index if not exists idx_content_assets_cycle_id
  on public.content_assets (cycle_id);

create index if not exists idx_content_assets_cycle_type
  on public.content_assets (cycle_id, type);

-- ============================================================
-- 1e. Add indexes
-- ============================================================

create index if not exists idx_service_cycles_client_id
  on public.service_cycles (client_id, status);

create index if not exists idx_service_cycles_dates
  on public.service_cycles (client_id, start_date, end_date);

create index if not exists idx_content_plans_cycle_id
  on public.content_plans (cycle_id);

create index if not exists idx_content_plans_client_id
  on public.content_plans (client_id);

-- ============================================================
-- 1f. Add triggers
-- ============================================================

create trigger service_cycles_set_updated_at
  before update on public.service_cycles
  for each row execute function public.set_updated_at();

-- ============================================================
-- 1g. RLS policies
-- ============================================================

alter table public.service_cycles enable row level security;
alter table public.content_plans enable row level security;

-- Cycles: readable by all authenticated, writable by admins
create policy "Cycles readable by authenticated" on public.service_cycles
  for select to authenticated using (true);

create policy "Cycles managed by admins" on public.service_cycles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Plans: readable by all authenticated, writable by admins
create policy "Plans readable by authenticated" on public.content_plans
  for select to authenticated using (true);

create policy "Plans managed by admins" on public.content_plans
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 1h. Auto-numbering RPC function (monotonic, race-safe)
-- ============================================================

create or replace function public.assign_asset_number(
  p_cycle_id uuid,
  p_asset_type public.asset_type
)
returns integer
language plpgsql
as $$
declare
  v_next integer;
begin
  -- Atomic: lock the sequence row, read the current counter, increment, return the old value
  update public.service_cycle_sequences
  set next_number = next_number + 1
  where cycle_id = p_cycle_id and asset_type = p_asset_type
  returning next_number - 1 into v_next;

  -- If no sequence row exists for this cycle+type, create one and return 1
  if v_next is null then
    insert into public.service_cycle_sequences (cycle_id, asset_type, next_number)
    values (p_cycle_id, p_asset_type, 2)
    on conflict (cycle_id, asset_type) do update
      set next_number = service_cycle_sequences.next_number + 1
    returning next_number - 1 into v_next;
  end if;

  return v_next;
end;
$$;

-- ============================================================
-- 1i. Plan generation RPC function
-- ============================================================

create or replace function public.generate_content_plan(
  p_cycle_id uuid
)
returns setof public.content_plans
language plpgsql
as $$
declare
  v_rec record;
  v_num_weeks integer;
  v_base_reels integer;
  v_base_posters integer;
  v_reel_remainder integer;
  v_poster_remainder integer;
  v_i integer;
  v_week_start date;
  v_week_end date;
  v_reels integer;
  v_posters integer;
begin
  select * into v_rec
  from public.service_cycles where id = p_cycle_id;

  if not found then
    raise exception 'Cycle not found';
  end if;

  v_num_weeks := ceil((v_rec.end_date - v_rec.start_date + 1) / 7.0);
  v_base_reels := v_rec.reels_target / v_num_weeks;
  v_base_posters := v_rec.posters_target / v_num_weeks;
  v_reel_remainder := v_rec.reels_target - (v_base_reels * v_num_weeks);
  v_poster_remainder := v_rec.posters_target - (v_base_posters * v_num_weeks);

  for v_i in 0 .. (v_num_weeks - 1) loop
    v_week_start := v_rec.start_date + (v_i * 7);
    v_week_end := least(v_week_start + 6, v_rec.end_date);

    v_reels := v_base_reels + case
      when v_reel_remainder > 0 and (v_i + 1) = any(
        array(select generate_series(1, v_num_weeks, greatest(1, v_num_weeks / (v_reel_remainder + 1))))
      ) then 1 else 0
    end;

    v_posters := v_base_posters + case
      when v_poster_remainder > 0 and (v_i + 1) = any(
        array(select generate_series(1, v_num_weeks, greatest(1, v_num_weeks / (v_poster_remainder + 1))))
      ) then 1 else 0
    end;

    return query insert into public.content_plans
      (cycle_id, client_id, week_number, week_start, week_end, planned_reels, planned_posters)
    values
      (p_cycle_id, v_rec.client_id, v_i + 1, v_week_start, v_week_end, v_reels, v_posters)
    returning *;
  end loop;
end;
$$;

-- ============================================================
-- 1j. Migration of existing data (safe, no-op if no data)
-- ============================================================

do $$
declare
  c record;
  v_new_cycle_id uuid;
begin
  for c in
    select id, contract_start_date, contract_end_date,
           monthly_reels_target, monthly_posts_target, created_by
    from public.clients
    where contract_start_date is not null
      and contract_end_date is not null
      and not exists (
        select 1 from public.service_cycles where client_id = clients.id
      )
  loop
    insert into public.service_cycles
      (client_id, start_date, end_date, reels_target, posters_target, status, created_by)
    values
      (c.id, c.contract_start_date, c.contract_end_date,
       c.monthly_reels_target, c.monthly_posts_target, 'active', c.created_by)
    returning id into v_new_cycle_id;

    -- Generate plan for this cycle
    perform public.generate_content_plan(v_new_cycle_id);

    -- Initialize sequence counters for existing assets
    insert into public.service_cycle_sequences (cycle_id, asset_type, next_number)
      select v_new_cycle_id, type, count(*) + 1
      from public.content_assets
      where client_id = c.id
        and cycle_id is null
        and created_at >= c.contract_start_date
        and created_at <= c.contract_end_date + interval '1 day'
      group by type;

    -- Set asset_number for existing assets (ordered by created_at)
    with numbered as (
      select id,
             row_number() over (partition by type order by created_at) as rn
      from public.content_assets
      where client_id = c.id
        and cycle_id is null
        and created_at >= c.contract_start_date
        and created_at <= c.contract_end_date + interval '1 day'
    )
    update public.content_assets a
    set cycle_id = v_new_cycle_id,
        asset_number = n.rn
    from numbered n
    where a.id = n.id;

    -- Link remaining assets (outside contract dates) without numbering
    update public.content_assets
    set cycle_id = v_new_cycle_id
    where client_id = c.id
      and cycle_id is null;
  end loop;
end $$;

commit;
