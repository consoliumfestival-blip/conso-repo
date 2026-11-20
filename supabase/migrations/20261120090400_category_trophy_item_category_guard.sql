begin;

create or replace function public.enforce_category_trophy_item_category()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.festival_id is not null
     and (new.is_active is distinct from false)
     and exists (
       select 1 from public.festival_calendar fc
       where fc.id = new.festival_id and fc.category_trophy_enabled is true
     )
     and (
       coalesce(array_length(new.category_codes, 1), 0) <> 1
       or nullif(btrim(new.category_codes[1]), '') is null
       or not exists (
         select 1 from public.festival_categories c
         where c.festival_id = new.festival_id
           and upper(btrim(c.code)) = upper(btrim(new.category_codes[1]))
       )
     ) then
    raise exception 'Category Trophy Mode requires exactly one valid category code per active item.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists category_trophy_item_category_guard on public.items;
create trigger category_trophy_item_category_guard
before insert or update of festival_id, category_codes, is_active on public.items
for each row execute function public.enforce_category_trophy_item_category();

revoke all on function public.enforce_category_trophy_item_category() from public;

commit;
