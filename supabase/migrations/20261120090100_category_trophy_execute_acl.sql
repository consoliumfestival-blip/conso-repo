begin;

revoke execute on function public.super_get_festival_category_trophy_mode(uuid, uuid) from public, anon;
revoke execute on function public.super_set_festival_category_trophy_mode(uuid, uuid, boolean, boolean) from public, anon;
revoke execute on function public.get_admin_category_trophy_standings(uuid, uuid) from public, anon;

grant execute on function public.super_get_festival_category_trophy_mode(uuid, uuid) to authenticated;
grant execute on function public.super_set_festival_category_trophy_mode(uuid, uuid, boolean, boolean) to authenticated;
grant execute on function public.get_admin_category_trophy_standings(uuid, uuid) to authenticated;

commit;
