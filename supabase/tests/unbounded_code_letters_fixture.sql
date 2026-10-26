-- Run only in a disposable PostgreSQL/Supabase test database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA realtime;
CREATE SCHEMA code_letter_private;
CREATE SCHEMA code_letter_test;

CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.organisations (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id));
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id), festival_id uuid NOT NULL,
  item_id uuid NOT NULL, venue_id uuid, start_time timestamptz NOT NULL, end_time timestamptz NOT NULL,
  is_shuffle_locked boolean NOT NULL DEFAULT false
);
CREATE TABLE public.participants (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, festival_id uuid NOT NULL, organisation_id uuid NOT NULL,
  chest_number text, name text
);
CREATE TABLE public.registrations (
  id uuid PRIMARY KEY, participant_id uuid, group_leader_participant_id uuid, organisation_id uuid NOT NULL,
  tenant_id uuid NOT NULL, festival_id uuid NOT NULL, item_id uuid NOT NULL, entry_chest_number text,
  status text NOT NULL DEFAULT 'approved', is_verified boolean NOT NULL DEFAULT true,
  code_letter text, code_letter_fixed boolean NOT NULL DEFAULT false,
  CONSTRAINT registrations_fixed_letter_valid CHECK
    (NOT code_letter_fixed OR (code_letter IS NOT NULL AND code_letter ~ '^[A-Z]$'))
);
CREATE UNIQUE INDEX idx_unique_code_letter ON public.registrations(item_id, code_letter)
  WHERE code_letter IS NOT NULL AND status <> 'rejected' AND is_verified;
CREATE TABLE public.group_members (registration_id uuid NOT NULL, participant_id uuid NOT NULL);
CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid, user_id uuid, action text,
  table_name text, record_id uuid, old_value jsonb, new_value jsonb
);
CREATE TABLE realtime.broadcasts (payload jsonb, event text, topic text, private boolean);

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO realtime.broadcasts VALUES ($1, $2, $3, $4);
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE FUNCTION public.stage_assert_admin_access() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT current_setting('code_letter_test.tenant')::uuid $$;
CREATE FUNCTION public.get_visible_organisations(p_tenant_id uuid)
RETURNS TABLE(id uuid, tenant_id uuid) LANGUAGE sql STABLE AS $$
  SELECT o.id, o.tenant_id FROM public.organisations o WHERE o.tenant_id = p_tenant_id
$$;

CREATE FUNCTION code_letter_private.entries(s public.schedules, portal boolean)
RETURNS SETOF public.registrations LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT r.* FROM public.registrations r
  WHERE r.item_id = s.item_id AND r.festival_id = s.festival_id
    AND (r.organisation_id IN (SELECT v.id FROM public.get_visible_organisations(s.tenant_id) v)
      OR r.tenant_id IN (SELECT v.tenant_id FROM public.get_visible_organisations(s.tenant_id) v)
      OR (portal AND EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT v.id FROM public.get_visible_organisations(s.tenant_id) v))));
$$;
CREATE FUNCTION code_letter_private.lock_schedule(tenant uuid, schedule uuid)
RETURNS public.schedules LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE s public.schedules; original_festival uuid; original_item uuid;
BEGIN
  SELECT * INTO s FROM public.schedules WHERE id = schedule AND tenant_id = tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule outside scope' USING ERRCODE='42501'; END IF;
  original_festival := s.festival_id; original_item := s.item_id;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('code-letters:' || s.festival_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s.festival_id::text || ':' || s.item_id::text, 0));
  SELECT * INTO s FROM public.schedules WHERE id=schedule AND tenant_id=tenant FOR UPDATE;
  IF NOT FOUND OR s.festival_id IS DISTINCT FROM original_festival OR s.item_id IS DISTINCT FROM original_item THEN
    RAISE EXCEPTION 'Schedule changed' USING ERRCODE='40001'; END IF;
  IF s.is_shuffle_locked THEN RAISE EXCEPTION 'Code letters are locked' USING ERRCODE='55000'; END IF;
  PERFORM r.id FROM public.registrations r WHERE r.item_id=s.item_id AND r.festival_id=s.festival_id ORDER BY r.id FOR UPDATE;
  RETURN s;
END;
$$;
CREATE FUNCTION code_letter_private.people(registration uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT r.participant_id FROM public.registrations r WHERE r.id=registration AND r.participant_id IS NOT NULL
  UNION SELECT g.participant_id FROM public.group_members g WHERE g.registration_id=registration;
$$;
CREATE FUNCTION code_letter_private.conflicts(s public.schedules, registration uuid, portal boolean)
RETURNS text[] LANGUAGE sql STABLE SET search_path TO '' AS $$
  WITH members AS MATERIALIZED (SELECT person FROM code_letter_private.people(registration) person)
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT r.code_letter), ARRAY[]::text[])
  FROM public.registrations r JOIN public.schedules other
    ON other.item_id=r.item_id AND other.festival_id=r.festival_id AND other.tenant_id=s.tenant_id
  WHERE r.festival_id=s.festival_id AND other.id<>s.id AND r.status<>'rejected'
    AND r.is_verified IS TRUE AND r.code_letter IS NOT NULL
    AND other.start_time<s.end_time AND other.end_time>s.start_time
    AND (r.participant_id IN (SELECT person FROM members) OR EXISTS (
      SELECT 1 FROM public.group_members g WHERE g.registration_id=r.id
        AND g.participant_id IN (SELECT person FROM members)));
$$;
CREATE FUNCTION code_letter_private.match_entry(entry text, choices jsonb, matching jsonb, seen text[])
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE letter text; moved jsonb;
BEGIN
  FOR letter IN SELECT pg_catalog.jsonb_array_elements_text(choices->entry) LOOP
    IF letter=ANY(seen) THEN CONTINUE; END IF;
    IF NOT matching ? letter THEN RETURN matching || pg_catalog.jsonb_build_object(letter,entry); END IF;
    moved:=code_letter_private.match_entry(matching->>letter,choices,matching,pg_catalog.array_append(seen,letter));
    IF moved IS NOT NULL THEN RETURN moved || pg_catalog.jsonb_build_object(letter,entry); END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE FUNCTION code_letter_private.clear_fixed_on_clear()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN IF NEW.code_letter IS NULL THEN NEW.code_letter_fixed:=false; END IF; RETURN NEW; END;
$$;
CREATE TRIGGER registrations_clear_fixed_letter BEFORE UPDATE OF code_letter ON public.registrations
FOR EACH ROW EXECUTE FUNCTION code_letter_private.clear_fixed_on_clear();

CREATE FUNCTION code_letter_private.notify_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE s record; changed record;
BEGIN
  FOR changed IN SELECT DISTINCT n.festival_id,n.item_id FROM code_letter_new n JOIN code_letter_old o ON o.id=n.id
    WHERE n.code_letter IS DISTINCT FROM o.code_letter OR n.code_letter_fixed IS DISTINCT FROM o.code_letter_fixed LOOP
    PERFORM realtime.send('{}'::jsonb,'changed','code-letters:festival:'||changed.festival_id::text,false);
    FOR s IN SELECT id,venue_id FROM public.schedules WHERE festival_id=changed.festival_id AND item_id=changed.item_id LOOP
      PERFORM realtime.send('{}'::jsonb,'changed','code-letters:schedule:'||s.id::text,false);
      IF s.venue_id IS NOT NULL THEN PERFORM realtime.send('{}'::jsonb,'changed','code-letters:venue:'||s.venue_id::text,false); END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER registrations_notify_code_letters AFTER UPDATE ON public.registrations
REFERENCING OLD TABLE AS code_letter_old NEW TABLE AS code_letter_new
FOR EACH STATEMENT EXECUTE FUNCTION code_letter_private.notify_change();

CREATE FUNCTION code_letter_test.assert(ok boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'PASS: %', label; END;
$$;
