-- Additive API: existing individual unassignment and roster editing stay intact.
CREATE OR REPLACE FUNCTION public.safe_delete_group_entry(p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor public.profiles;
  entry public.registrations;
  owner_id uuid;
  member_ids uuid[];
  snapshot jsonb;
  dependencies text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO actor FROM public.profiles WHERE id=auth.uid();
  IF actor.id IS NULL OR (actor.is_superadmin IS NOT TRUE AND actor.role IS DISTINCT FROM 'admin') THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO entry FROM public.registrations WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status','not_found');
  END IF;
  SELECT tenant_id INTO owner_id FROM public.festival_calendar WHERE id=entry.festival_id;
  IF owner_id IS NULL OR entry.tenant_id IS DISTINCT FROM owner_id
    OR (actor.is_superadmin IS NOT TRUE AND (actor.tenant_id IS DISTINCT FROM owner_id
      OR NOT EXISTS (SELECT 1 FROM public.get_visible_organisations(actor.tenant_id) o WHERE o.id=entry.organisation_id))) THEN
    RAISE EXCEPTION 'Administrator access to this festival and team is required.' USING ERRCODE='42501';
  END IF;
  IF entry.entry_kind IS DISTINCT FROM 'general_team' OR entry.is_group_registration IS NOT TRUE
    OR entry.participant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only group team entries can be deleted here.' USING ERRCODE='22023';
  END IF;

  -- Lock members against concurrent attendance/certificate FK inserts. Marks,
  -- results and roster edits serialize on the registration row locked above.
  PERFORM p.id FROM public.participants p JOIN public.group_members gm ON gm.participant_id=p.id
    WHERE gm.registration_id=entry.id ORDER BY p.id FOR UPDATE OF p;
  SELECT COALESCE(pg_catalog.array_agg(gm.participant_id ORDER BY gm.participant_id),ARRAY[]::uuid[])
    INTO member_ids FROM public.group_members gm WHERE gm.registration_id=entry.id;
  IF entry.is_verified IS TRUE OR entry.code_letter_fixed IS TRUE OR entry.code_letter IS NOT NULL THEN
    dependencies:=pg_catalog.array_append(dependencies,'check-in or code letters');
  END IF;
  IF EXISTS (SELECT 1 FROM public.mark_entries WHERE registration_id=entry.id) THEN
    dependencies:=pg_catalog.array_append(dependencies,'judge marks');
  END IF;
  IF EXISTS (SELECT 1 FROM public.results WHERE registration_id=entry.id) THEN
    dependencies:=pg_catalog.array_append(dependencies,'results or points');
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance a JOIN public.schedules s ON s.id=a.schedule_id
    WHERE a.participant_id=ANY(member_ids) AND s.item_id=entry.item_id AND s.festival_id=entry.festival_id) THEN
    dependencies:=pg_catalog.array_append(dependencies,'member attendance');
  END IF;
  IF EXISTS (SELECT 1 FROM public.certificates c
    WHERE c.participant_id=ANY(member_ids) AND c.item_id=entry.item_id) THEN
    dependencies:=pg_catalog.array_append(dependencies,'member certificates');
  END IF;
  IF pg_catalog.cardinality(dependencies)>0 THEN
    RETURN pg_catalog.jsonb_build_object('status','blocked','message',
      'This entry has '||pg_catalog.array_to_string(dependencies,', ')||'. Its competition history must be preserved.');
  END IF;

  SELECT pg_catalog.to_jsonb(entry)||pg_catalog.jsonb_build_object('members',COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(gm) ORDER BY gm.participant_id),'[]'::jsonb))
    INTO snapshot FROM public.group_members gm WHERE gm.registration_id=entry.id;
  BEGIN
    DELETE FROM public.group_members WHERE registration_id=entry.id;
    DELETE FROM public.registrations WHERE id=entry.id;
  EXCEPTION WHEN foreign_key_violation THEN
    -- This subtransaction restores the roster too if any dependency blocks deletion.
    RETURN pg_catalog.jsonb_build_object('status','blocked','message','Linked competition history prevents deletion. Nothing was deleted.');
  END;
  INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES(owner_id,actor.id,'GROUP_ENTRY_DELETE','registrations',entry.id,snapshot,
      pg_catalog.jsonb_build_object('status','removed','participant_records_preserved',true));
  RETURN pg_catalog.jsonb_build_object('status','removed','registration_id',entry.id,
    'festival_id',entry.festival_id,'member_ids',member_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.safe_delete_group_entry(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.safe_delete_group_entry(uuid) TO authenticated;
