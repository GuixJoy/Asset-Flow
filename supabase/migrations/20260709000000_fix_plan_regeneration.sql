begin;

-- Fix: generate_content_plan must delete existing plan rows before regenerating
-- This prevents stale plan data when cycle deliverables are edited

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

  -- Delete existing plan rows so regeneration is always clean
  delete from public.content_plans where cycle_id = p_cycle_id;

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

commit;
