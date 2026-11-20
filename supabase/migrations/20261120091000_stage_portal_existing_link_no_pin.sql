begin;

-- The venue UUID in the existing Stage URL now grants access. Keep the old
-- function signature so deployed portal clients remain compatible.
create or replace function stage_portal_private.assert_pin(p_venue_id uuid, p_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_festival_id uuid;
begin
  if p_venue_id is null then return 'Invalid stage link.'; end if;

  select v.tenant_id, v.festival_id
    into v_tenant_id, v_festival_id
  from public.venues v
  where v.id = p_venue_id;
  if not found or v_tenant_id is null or v_festival_id is null then
    return 'Invalid stage link.';
  end if;

  if not exists (
    select 1 from public.festival_calendar fc
    where fc.id = v_festival_id
      and fc.tenant_id = v_tenant_id
      and fc.is_active is true
  ) then
    return 'This festival is not active.';
  end if;

  if not public.tenant_module_enabled(v_tenant_id, 'stage_management') then
    return 'Stage Management is disabled for this tenant.';
  end if;

  return null;
end;
$$;

revoke all on function stage_portal_private.assert_pin(uuid, text) from public, anon, authenticated;
grant execute on function stage_portal_private.assert_pin(uuid, text) to postgres, service_role;

commit;
