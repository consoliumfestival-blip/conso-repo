begin;

alter table public.festival_calendar
  add column if not exists category_trophy_enabled boolean not null default false;

create or replace function public.enforce_category_trophy_mode_superadmin()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.category_trophy_enabled is true and public.is_superadmin() is distinct from true then
      raise exception 'Only a Super Administrator can change Category Trophy Mode.' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.category_trophy_enabled is distinct from old.category_trophy_enabled
       and public.is_superadmin() is distinct from true then
      raise exception 'Only a Super Administrator can change Category Trophy Mode.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists festival_category_trophy_mode_guard on public.festival_calendar;
create trigger festival_category_trophy_mode_guard
before insert or update of category_trophy_enabled on public.festival_calendar
for each row execute function public.enforce_category_trophy_mode_superadmin();

create or replace function public.super_get_festival_category_trophy_mode(
  p_tenant_id uuid,
  p_festival_id uuid
)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
begin
  if auth.uid() is null or public.is_superadmin() is distinct from true then
    raise exception 'Super administrator access required.' using errcode = '42501';
  end if;

  select fc.category_trophy_enabled
    into v_enabled
  from public.festival_calendar fc
  where fc.id = p_festival_id and fc.tenant_id = p_tenant_id;

  if not found then
    raise exception 'Festival does not belong to this tenant.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('festival_id', p_festival_id, 'enabled', v_enabled);
end;
$$;

create or replace function public.super_set_festival_category_trophy_mode(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_enabled boolean,
  p_expected_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current boolean;
  v_invalid_count integer;
begin
  if auth.uid() is null or public.is_superadmin() is distinct from true then
    raise exception 'Super administrator access required.' using errcode = '42501';
  end if;

  select fc.category_trophy_enabled
    into v_current
  from public.festival_calendar fc
  where fc.id = p_festival_id and fc.tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Festival does not belong to this tenant.' using errcode = 'P0002';
  end if;
  if v_current is distinct from p_expected_enabled then
    raise exception 'Category Trophy Mode changed. Refresh and try again.' using errcode = '40001';
  end if;

  if coalesce(p_enabled, false) and not v_current then
    select count(*)::integer into v_invalid_count
    from public.items i
    where i.festival_id = p_festival_id
      and (i.is_active is distinct from false)
      and (
        coalesce(array_length(i.category_codes, 1), 0) <> 1
        or nullif(btrim(i.category_codes[1]), '') is null
        or not exists (
          select 1
          from public.festival_categories c
          where c.festival_id = p_festival_id
            and upper(btrim(c.code)) = upper(btrim(i.category_codes[1]))
        )
      );
    if v_invalid_count > 0 then
      raise exception 'Cannot enable Category Trophy Mode: % active item(s) have a missing, ambiguous, or unknown category code.', v_invalid_count
        using errcode = '22023';
    end if;
  end if;

  update public.festival_calendar
  set category_trophy_enabled = coalesce(p_enabled, false)
  where id = p_festival_id and tenant_id = p_tenant_id;

  if v_current is distinct from coalesce(p_enabled, false) then
    insert into public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    values (
      p_tenant_id,
      auth.uid(),
      'super_set_category_trophy_mode',
      'festival_calendar',
      p_festival_id,
      jsonb_build_object('category_trophy_enabled', v_current),
      jsonb_build_object('category_trophy_enabled', coalesce(p_enabled, false))
    );
  end if;

  return jsonb_build_object('festival_id', p_festival_id, 'enabled', coalesce(p_enabled, false));
end;
$$;

create or replace function public.get_category_trophy_mode(
  p_tenant_id uuid,
  p_festival_id uuid
)
returns table(enabled boolean, public_visible boolean)
language sql
stable security definer
set search_path = ''
as $$
  select fc.category_trophy_enabled,
         coalesce(ls.is_public_visible, false)
  from public.festival_calendar fc
  left join public.festival_leaderboard_settings ls on ls.festival_id = fc.id
  where fc.id = p_festival_id and fc.tenant_id = p_tenant_id;
$$;

create or replace function public._category_trophy_standings(
  p_festival_id uuid,
  p_public boolean
)
returns table(
  category_code text,
  category_name text,
  category_sort_order integer,
  organisation_id uuid,
  organisation_name text,
  total_points bigint,
  first_place_count bigint,
  second_place_count bigint,
  third_place_count bigint,
  result_count bigint,
  rank_position integer,
  is_winner boolean
)
language sql
stable security definer
set search_path = ''
as $$
  with festival_scope as (
    select fc.id, fc.tenant_id, fc.category_trophy_enabled,
           coalesce(ls.is_public_visible, false) as public_visible,
           coalesce(ls.ranking_mode, 'ALL') as ranking_mode,
           ls.item_limit
    from public.festival_calendar fc
    left join public.festival_leaderboard_settings ls on ls.festival_id = fc.id
    where fc.id = p_festival_id
  ),
  limited_items as (
    select r.item_id
    from public.results r, festival_scope fs
    where r.festival_id = fs.id
      and r.published is true
      and coalesce(r.result_status, 'draft') in ('published', 'ready')
      and coalesce(r.public_visible, false) is true
    group by r.item_id
    order by min(r.published_at) asc nulls last, r.item_id asc
    limit (select case when ranking_mode = 'LIMITED' and item_limit > 0 then item_limit else 2147483647 end from festival_scope)
  ),
  deduped_results as (
    select distinct on (coalesce(r.registration_id, r.id), r.item_id)
      r.id as result_id, r.item_id, r.points_awarded, r.rank,
      r.registration_id, r.published_at
    from public.results r
    join festival_scope fs on fs.id = r.festival_id
    left join public.registrations reg on reg.id = r.registration_id
    where r.published is true
      and coalesce(r.result_status, 'draft') in ('published', 'ready')
      and coalesce(r.public_visible, false) is true
      and reg.status is distinct from 'rejected'
      and r.item_id in (select item_id from limited_items)
    order by coalesce(r.registration_id, r.id), r.item_id,
             r.published_at desc nulls last, r.id desc
  ),
  item_categories as (
    select i.id as item_id, upper(btrim(i.category_codes[1])) as category_code
    from public.items i
    join festival_scope fs on fs.id = i.festival_id
    where coalesce(array_length(i.category_codes, 1), 0) = 1
      and nullif(btrim(i.category_codes[1]), '') is not null
  ),
  award_rows as (
    select distinct a.result_id, a.organisation_id
    from public.result_team_awards a
    join deduped_results dr on dr.result_id = a.result_id
  ),
  resolved_results as (
    select distinct dr.result_id, dr.item_id, dr.points_awarded, dr.rank,
           coalesce(ar.organisation_id, reg.organisation_id, participant.organisation_id) as organisation_id
    from deduped_results dr
    left join award_rows ar on ar.result_id = dr.result_id
    left join public.registrations reg on reg.id = dr.registration_id
    left join public.participants participant on participant.id = reg.participant_id
  ),
  categories as (
    select c.code, c.name, c.sort_order
    from public.festival_categories c, festival_scope fs
    where c.festival_id = fs.id
      and c.is_active is true
      and upper(btrim(c.code)) not in ('GN', 'GENERAL')
  ),
  teams as (
    select t.organisation_id, o.name
    from public.festival_teams t
    join festival_scope fs on fs.id = t.festival_id
    join public.organisations o on o.id = t.organisation_id
    where t.is_active is true
  ),
  scores as (
    select ic.category_code, rr.organisation_id,
           coalesce(sum(rr.points_awarded), 0)::bigint as total_points,
           count(*) filter (where rr.rank = 1)::bigint as first_place_count,
           count(*) filter (where rr.rank = 2)::bigint as second_place_count,
           count(*) filter (where rr.rank = 3)::bigint as third_place_count,
           count(*)::bigint as result_count
    from resolved_results rr
    join item_categories ic on ic.item_id = rr.item_id
    join teams t on t.organisation_id = rr.organisation_id
    group by ic.category_code, rr.organisation_id
  ),
  grid as (
    select c.code as category_code, c.name as category_name, c.sort_order as category_sort_order,
           t.organisation_id, t.name as organisation_name,
           coalesce(s.total_points, 0)::bigint as total_points,
           coalesce(s.first_place_count, 0)::bigint as first_place_count,
           coalesce(s.second_place_count, 0)::bigint as second_place_count,
           coalesce(s.third_place_count, 0)::bigint as third_place_count,
           coalesce(s.result_count, 0)::bigint as result_count
    from categories c cross join teams t
    left join scores s on upper(btrim(s.category_code)) = upper(btrim(c.code))
                       and s.organisation_id = t.organisation_id
  ),
  ranked as (
    select g.*,
           row_number() over (
             partition by g.category_code
             order by g.total_points desc, g.first_place_count desc,
                      g.second_place_count desc, g.third_place_count desc,
                      g.organisation_name asc, g.organisation_id asc
           )::integer as rank_position
    from grid g
  )
  select r.category_code, r.category_name, r.category_sort_order,
         r.organisation_id, r.organisation_name, r.total_points,
         r.first_place_count, r.second_place_count, r.third_place_count,
         r.result_count, r.rank_position,
         (r.rank_position = 1 and r.result_count > 0) as is_winner
  from ranked r, festival_scope fs
  where fs.category_trophy_enabled is true
    and (p_public is false or fs.public_visible is true)
  order by r.category_sort_order, r.category_name, r.rank_position;
$$;

create or replace function public.get_public_category_trophy_standings(
  p_tenant_id uuid,
  p_festival_id uuid
)
returns table(
  category_code text,
  category_name text,
  category_sort_order integer,
  organisation_id uuid,
  organisation_name text,
  total_points bigint,
  first_place_count bigint,
  second_place_count bigint,
  third_place_count bigint,
  result_count bigint,
  rank_position integer,
  is_winner boolean
)
language plpgsql
stable security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.festival_calendar fc
    where fc.id = p_festival_id and fc.tenant_id = p_tenant_id
  ) then
    return;
  end if;
  return query select * from public._category_trophy_standings(p_festival_id, true);
end;
$$;

create or replace function public.get_admin_category_trophy_standings(
  p_tenant_id uuid,
  p_festival_id uuid
)
returns table(
  category_code text,
  category_name text,
  category_sort_order integer,
  organisation_id uuid,
  organisation_name text,
  total_points bigint,
  first_place_count bigint,
  second_place_count bigint,
  third_place_count bigint,
  result_count bigint,
  rank_position integer,
  is_winner boolean
)
language plpgsql
stable security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.festival_calendar fc
    where fc.id = p_festival_id and fc.tenant_id = p_tenant_id
  ) then
    return;
  end if;
  return query select * from public._category_trophy_standings(p_festival_id, false);
end;
$$;

revoke all on function public.enforce_category_trophy_mode_superadmin() from public;
revoke all on function public.super_get_festival_category_trophy_mode(uuid, uuid) from public;
revoke all on function public.super_set_festival_category_trophy_mode(uuid, uuid, boolean, boolean) from public;
revoke all on function public.get_category_trophy_mode(uuid, uuid) from public;
revoke all on function public._category_trophy_standings(uuid, boolean) from public;
revoke all on function public.get_public_category_trophy_standings(uuid, uuid) from public;
revoke all on function public.get_admin_category_trophy_standings(uuid, uuid) from public;

grant execute on function public.super_get_festival_category_trophy_mode(uuid, uuid) to authenticated;
grant execute on function public.super_set_festival_category_trophy_mode(uuid, uuid, boolean, boolean) to authenticated;
grant execute on function public.get_category_trophy_mode(uuid, uuid) to anon, authenticated;
grant execute on function public.get_public_category_trophy_standings(uuid, uuid) to anon, authenticated;
grant execute on function public.get_admin_category_trophy_standings(uuid, uuid) to authenticated;

commit;
