begin;

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

commit;
