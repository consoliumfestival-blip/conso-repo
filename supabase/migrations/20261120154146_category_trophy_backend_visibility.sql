begin;

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
      and (p_public is false or coalesce(r.public_visible, false) is true)
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
      and (p_public is false or coalesce(r.public_visible, false) is true)
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
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if public.is_superadmin() is distinct from true
     and public.get_my_tenant_id() is distinct from p_tenant_id then
    raise exception 'Tenant access required.' using errcode = '42501';
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

commit;
