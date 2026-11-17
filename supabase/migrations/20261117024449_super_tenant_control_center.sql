BEGIN;

-- Tenant feature switches are stored separately so this release does not
-- change the tenant provisioning contract or rewrite festival data.
CREATE TABLE public.tenant_feature_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  modules jsonb NOT NULL DEFAULT '{
    "team_leader_management": true,
    "team_leader_portal": true,
    "smart_announcer": true,
    "stage_management": true,
    "judge_portal": true,
    "direct_entry": true,
    "public_page": true,
    "public_leaderboard": true,
    "poster_studio": true,
    "media_center": true
  }'::jsonb,
  sections jsonb NOT NULL DEFAULT '{
    "team_leader_portal": {"my_team": true, "schedule": true, "results": true, "participants": true, "programs": true, "announcements": true},
    "public_page": {"schedule": true, "results": true, "participant_results": true, "media": true}
  }'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_feature_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_feature_settings FROM PUBLIC, anon, authenticated;

INSERT INTO public.tenant_feature_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_tenant_feature_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.tenant_feature_settings (tenant_id)
  VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tenants_seed_feature_settings
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.seed_tenant_feature_settings();

CREATE OR REPLACE FUNCTION public.tenant_module_enabled(p_tenant_id uuid, p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_tenant_id IS NULL OR p_module IS NULL THEN false
    WHEN p_module = 'team_leader_portal' THEN
      COALESCE((s.modules->>'team_leader_management')::boolean, true)
      AND COALESCE((s.modules->>'team_leader_portal')::boolean, true)
    ELSE COALESCE((s.modules->>p_module)::boolean, true)
  END
  FROM public.tenants t
  LEFT JOIN public.tenant_feature_settings s ON s.tenant_id = t.id
  WHERE t.id = p_tenant_id;
$function$;

CREATE OR REPLACE FUNCTION public.tenant_module_section_enabled(p_tenant_id uuid, p_module text, p_section text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_module = 'team_leader_portal' THEN
      public.tenant_module_enabled(p_tenant_id, p_module)
      AND COALESCE((s.sections->'team_leader_portal'->>p_section)::boolean, true)
    WHEN p_module = 'public_page' THEN
      public.tenant_module_enabled(p_tenant_id, p_module)
      AND COALESCE((s.sections->'public_page'->>p_section)::boolean, true)
    ELSE public.tenant_module_enabled(p_tenant_id, p_module)
  END
  FROM public.tenants t
  LEFT JOIN public.tenant_feature_settings s ON s.tenant_id = t.id
  WHERE t.id = p_tenant_id;
$function$;

-- Narrow capability RPC used by privileged edge services. It reveals only a
-- single module decision and requires a tenant administrator for that tenant.
CREATE OR REPLACE FUNCTION public.authenticated_tenant_module_enabled(p_tenant_id uuid, p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_superadmin IS TRUE OR p.role = 'super_admin'
          OR (p.tenant_id = p_tenant_id AND p.role IN ('admin','tenant_admin','festival_admin','admin_leader')))
    )
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.access_disabled IS FALSE)
    AND public.tenant_module_enabled(p_tenant_id, p_module)
$function$;

-- Anonymous public pages can read only media while the tenant explicitly
-- exposes its Public Page media section.
CREATE OR REPLACE FUNCTION public.public_page_media_enabled(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = p_tenant_id AND t.access_disabled IS FALSE
      AND public.tenant_module_section_enabled(t.id, 'public_page', 'media')
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_tenant_feature_settings(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_settings public.tenant_feature_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_superadmin() IS TRUE
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.tenant_id = p_tenant_id
        AND p.role IN ('admin', 'tenant_admin', 'festival_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.tenant_id = p_tenant_id AND p.role = 'judge'
    )
    OR EXISTS (
      SELECT 1 FROM public.team_leader_assignments a
      JOIN public.festival_teams ft ON ft.id = a.festival_team_id
      WHERE a.user_id = auth.uid() AND a.status = 'active' AND a.revoked_at IS NULL
        AND ft.parent_tenant_id = p_tenant_id
    )
  ) THEN
    RAISE EXCEPTION 'Tenant feature settings access required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_settings FROM public.tenant_feature_settings WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found.' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('tenant_id', p_tenant_id, 'modules', v_settings.modules,
    'sections', v_settings.sections, 'revision', v_settings.revision);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_tenant_feature_settings(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE WHEN t.access_disabled IS TRUE THEN
    jsonb_build_object('public_page', false, 'public_leaderboard', false,
      'sections', jsonb_build_object('schedule', false, 'results', false, 'participant_results', false, 'media', false))
  ELSE jsonb_build_object(
    'public_page', public.tenant_module_enabled(t.id, 'public_page'),
    'public_leaderboard', public.tenant_module_enabled(t.id, 'public_leaderboard'),
    'sections', jsonb_build_object(
      'schedule', public.tenant_module_section_enabled(t.id, 'public_page', 'schedule'),
      'results', public.tenant_module_section_enabled(t.id, 'public_page', 'results'),
      'participant_results', public.tenant_module_section_enabled(t.id, 'public_page', 'participant_results'),
      'media', public.tenant_module_section_enabled(t.id, 'public_page', 'media')))
  END
  FROM public.tenants t WHERE t.id = p_tenant_id;
$function$;

CREATE OR REPLACE FUNCTION public.super_get_tenant_control_data(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_tenant public.tenants%ROWTYPE; v_settings public.tenant_feature_settings%ROWTYPE;
        v_organisation public.organisations%ROWTYPE; v_festivals jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Super administrator access required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_organisation FROM public.organisations WHERE id = v_tenant.organisation_id;
  SELECT * INTO v_settings FROM public.tenant_feature_settings WHERE tenant_id = p_tenant_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', f.id, 'festival_year', f.festival_year, 'level', f.level,
    'custom_name', f.custom_name, 'is_active', f.is_active,
    'festival_template', f.festival_template,
    'chest_number_template', f.chest_number_template,
    'chest_number_category_range', f.chest_number_category_range
  ) ORDER BY f.is_active DESC, f.festival_year DESC NULLS LAST, f.id), '[]'::jsonb)
  INTO v_festivals FROM public.festival_calendar f WHERE f.tenant_id = p_tenant_id;
  RETURN jsonb_build_object(
    'tenant', jsonb_build_object('id', v_tenant.id, 'name', v_tenant.name, 'festival_template', v_tenant.festival_template,
      'organisation_id', v_organisation.id, 'organisation_name', v_organisation.name),
    'settings', jsonb_build_object('modules', v_settings.modules, 'sections', v_settings.sections, 'revision', v_settings.revision),
    'festivals', v_festivals
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.super_update_organisation_name(
  p_tenant_id uuid, p_name text, p_expected_name text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_organisation_id uuid; v_old text; v_name text := nullif(btrim(p_name), '');
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Super administrator access required.' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR length(v_name) > 160 THEN RAISE EXCEPTION 'Organisation name must contain 1 to 160 characters.' USING ERRCODE = '22023'; END IF;
  SELECT t.organisation_id INTO v_organisation_id FROM public.tenants t WHERE t.id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_organisation_id IS NULL THEN RAISE EXCEPTION 'Tenant organisation was not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT o.name INTO v_old FROM public.organisations o WHERE o.id = v_organisation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant organisation was not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_old IS DISTINCT FROM p_expected_name THEN RAISE EXCEPTION 'Organisation name changed. Refresh and try again.' USING ERRCODE = '40001'; END IF;
  IF v_old IS DISTINCT FROM v_name THEN
    UPDATE public.organisations SET name = v_name WHERE id = v_organisation_id;
    INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES(p_tenant_id,auth.uid(),'super_update_organisation_name','organisations',v_organisation_id,
      jsonb_build_object('name',v_old),jsonb_build_object('name',v_name));
  END IF;
  RETURN v_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.super_get_tenant_talents(p_tenant_id uuid, p_festival_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Super administrator access required.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.festival_calendar WHERE id = p_festival_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Festival does not belong to this tenant.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'item_code', i.item_code,
    'item_name_en', i.item_name_en, 'item_name_ml', i.item_name_ml)
    ORDER BY COALESCE(i.item_name_en, i.item_name_ml, i.item_code), i.id), '[]'::jsonb)
  INTO v_result FROM public.items i
  WHERE i.tenant_id = p_tenant_id AND i.festival_id = p_festival_id;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.super_update_tenant_modules(
  p_tenant_id uuid, p_modules jsonb, p_sections jsonb, p_expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_old public.tenant_feature_settings%ROWTYPE;
        v_modules jsonb; v_sections jsonb; v_key text;
        v_module_keys text[] := ARRAY['team_leader_management','team_leader_portal','smart_announcer','stage_management','judge_portal','direct_entry','public_page','public_leaderboard','poster_studio','media_center'];
        v_team_section_keys text[] := ARRAY['my_team','schedule','results','participants','programs','announcements'];
        v_public_section_keys text[] := ARRAY['schedule','results','participant_results','media'];
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Super administrator access required.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_modules) IS DISTINCT FROM 'object' OR jsonb_typeof(p_sections) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Module and section settings must be objects.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tenant_feature_settings (tenant_id) VALUES (p_tenant_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_old FROM public.tenant_feature_settings WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_old.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Tenant settings changed. Reload before saving.' USING ERRCODE = '40001';
  END IF;
  FOR v_key IN SELECT key FROM jsonb_each(p_modules) LOOP
    IF NOT v_key = ANY(v_module_keys) OR jsonb_typeof(p_modules->v_key) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid tenant module setting: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(p_sections->'team_leader_portal') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_sections->'public_page') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Team Leader and public section settings must be supplied separately.' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT key FROM jsonb_each(p_sections->'team_leader_portal') LOOP
    IF NOT v_key = ANY(v_team_section_keys) OR jsonb_typeof(p_sections->'team_leader_portal'->v_key) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid Team Leader section setting: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR v_key IN SELECT key FROM jsonb_each(p_sections->'public_page') LOOP
    IF NOT v_key = ANY(v_public_section_keys) OR jsonb_typeof(p_sections->'public_page'->v_key) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid public section setting: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_modules := v_old.modules || p_modules;
  v_sections := v_old.sections || jsonb_build_object(
    'team_leader_portal', v_old.sections->'team_leader_portal' || p_sections->'team_leader_portal',
    'public_page', v_old.sections->'public_page' || p_sections->'public_page'
  );
  IF COALESCE((v_modules->>'team_leader_management')::boolean, true) IS FALSE THEN
    v_modules := jsonb_set(v_modules, '{team_leader_portal}', 'false'::jsonb, true);
  END IF;
  UPDATE public.tenant_feature_settings SET modules = v_modules, sections = v_sections,
    revision = revision + 1, updated_by = auth.uid(), updated_at = now()
  WHERE tenant_id = p_tenant_id;
  INSERT INTO public.audit_logs (tenant_id,user_id,action,table_name,record_id,old_value,new_value)
  VALUES (p_tenant_id,auth.uid(),'super_update_tenant_modules','tenant_feature_settings',p_tenant_id,
    jsonb_build_object('modules',v_old.modules,'sections',v_old.sections,'revision',v_old.revision),
    jsonb_build_object('modules',v_modules,'sections',v_sections,'revision',v_old.revision + 1));
  RETURN jsonb_build_object('tenant_id',p_tenant_id,'modules',v_modules,'sections',v_sections,'revision',v_old.revision + 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.super_update_festival_name(
  p_tenant_id uuid, p_festival_id uuid, p_name text, p_expected_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_old text; v_name text := nullif(btrim(p_name), '');
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Super administrator access required.' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR length(v_name) > 160 THEN RAISE EXCEPTION 'Festival name must contain 1 to 160 characters.' USING ERRCODE = '22023'; END IF;
  SELECT custom_name INTO v_old FROM public.festival_calendar
  WHERE id = p_festival_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Festival does not belong to this tenant.' USING ERRCODE = 'P0002'; END IF;
  IF v_old IS DISTINCT FROM p_expected_name THEN RAISE EXCEPTION 'Festival name changed. Refresh and try again.' USING ERRCODE = '40001'; END IF;
  IF v_old IS DISTINCT FROM v_name THEN
    UPDATE public.festival_calendar SET custom_name = v_name WHERE id = p_festival_id;
    INSERT INTO public.audit_logs (tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES (p_tenant_id,auth.uid(),'super_update_festival_name','festival_calendar',p_festival_id,
      jsonb_build_object('custom_name',v_old),jsonb_build_object('custom_name',v_name));
  END IF;
  RETURN v_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.super_update_talent_name(
  p_tenant_id uuid, p_festival_id uuid, p_item_id uuid,
  p_name_en text, p_name_ml text, p_expected_name_en text, p_expected_name_ml text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_item public.items%ROWTYPE; v_en text := nullif(btrim(p_name_en), ''); v_ml text := nullif(btrim(p_name_ml), '');
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Super administrator access required.' USING ERRCODE = '42501';
  END IF;
  IF v_en IS NULL OR length(v_en) > 160 OR (p_name_ml IS NOT NULL AND length(btrim(p_name_ml)) > 160) THEN
    RAISE EXCEPTION 'Talent names must contain 1 to 160 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_item FROM public.items
  WHERE id = p_item_id AND tenant_id = p_tenant_id AND festival_id = p_festival_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Talent does not belong to this tenant and festival.' USING ERRCODE = 'P0002'; END IF;
  IF v_item.item_name_en IS DISTINCT FROM p_expected_name_en OR v_item.item_name_ml IS DISTINCT FROM p_expected_name_ml THEN
    RAISE EXCEPTION 'Talent name changed. Refresh and try again.' USING ERRCODE = '40001';
  END IF;
  IF v_item.item_name_en IS DISTINCT FROM v_en OR v_item.item_name_ml IS DISTINCT FROM v_ml THEN
    UPDATE public.items SET item_name_en = v_en, item_name_ml = v_ml WHERE id = p_item_id;
    INSERT INTO public.audit_logs (tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES (p_tenant_id,auth.uid(),'super_update_talent_name','items',p_item_id,
      jsonb_build_object('item_name_en',v_item.item_name_en,'item_name_ml',v_item.item_name_ml),
      jsonb_build_object('item_name_en',v_en,'item_name_ml',v_ml));
  END IF;
  RETURN jsonb_build_object('id',p_item_id,'item_name_en',v_en,'item_name_ml',v_ml);
END;
$function$;

CREATE OR REPLACE FUNCTION public.super_update_chest_settings(
  p_tenant_id uuid, p_festival_id uuid,
  p_expected_template text, p_expected_range integer,
  p_template text, p_range integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_festival public.festival_calendar%ROWTYPE; v_locked boolean;
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Super administrator access required.' USING ERRCODE = '42501';
  END IF;
  IF p_template NOT IN ('team','category') OR p_range NOT IN (100,1000) THEN
    RAISE EXCEPTION 'Choose a valid chest-number template and range.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  SELECT * INTO v_festival FROM public.festival_calendar
  WHERE id = p_festival_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Festival does not belong to this tenant.' USING ERRCODE = 'P0002'; END IF;
  IF v_festival.chest_number_template IS DISTINCT FROM p_expected_template
    OR v_festival.chest_number_category_range IS DISTINCT FROM p_expected_range THEN
    RAISE EXCEPTION 'Chest-number settings changed. Reload before saving.' USING ERRCODE = '40001';
  END IF;
  SELECT COALESCE(locked,false) INTO v_locked FROM public.festival_chest_number_controls WHERE festival_id = p_festival_id;
  IF COALESCE(v_locked,false) THEN RAISE EXCEPTION 'Unlock chest numbers with the tenant ID before changing this setting.' USING ERRCODE = '55000'; END IF;
  IF v_festival.chest_number_template IS DISTINCT FROM p_template OR v_festival.chest_number_category_range IS DISTINCT FROM p_range THEN
    UPDATE public.festival_calendar SET chest_number_template = p_template, chest_number_category_range = p_range
    WHERE id = p_festival_id;
    INSERT INTO public.festival_chest_number_controls AS current_control(festival_id,revision,updated_by)
    VALUES(p_festival_id,1,auth.uid()) ON CONFLICT (festival_id) DO UPDATE
      SET revision = current_control.revision + 1, updated_by = auth.uid(), updated_at = now();
    INSERT INTO public.audit_logs (tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES (p_tenant_id,auth.uid(),'super_update_chest_settings','festival_calendar',p_festival_id,
      jsonb_build_object('chest_number_template',v_festival.chest_number_template,'chest_number_category_range',v_festival.chest_number_category_range),
      jsonb_build_object('chest_number_template',p_template,'chest_number_category_range',p_range));
  END IF;
  RETURN jsonb_build_object('festival_id',p_festival_id,'template',p_template,'range',p_range);
END;
$function$;

CREATE OR REPLACE FUNCTION public.super_list_tenant_audit_logs(p_tenant_id uuid, p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, action text, table_name text, old_value jsonb, new_value jsonb, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_superadmin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Super administrator access required.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM (
      SELECT l.id,l.action,l.table_name,l.old_value,l.new_value,l.created_at
      FROM public.audit_logs l
      WHERE l.tenant_id = p_tenant_id AND l.action LIKE 'super_update_%'
      UNION ALL
      SELECT c.id,'chest_number_updated'::text,'participant_chest_number_changes'::text,
        jsonb_build_object('chest_number',c.old_chest_number,'organisation_id',c.old_organisation_id),
        jsonb_build_object('chest_number',c.new_chest_number,'organisation_id',c.new_organisation_id),c.changed_at
      FROM public.participant_chest_number_changes c WHERE c.tenant_id = p_tenant_id
      UNION ALL
      SELECT a.id,'chest_number_regenerated'::text,'chest_number_regeneration_audits'::text,
        '{}'::jsonb,jsonb_build_object('category_range',a.category_range,'participant_count',a.participant_count),a.regenerated_at
      FROM public.chest_number_regeneration_audits a WHERE a.tenant_id = p_tenant_id
    ) recent ORDER BY recent.created_at DESC LIMIT greatest(1, least(COALESCE(p_limit,100),250));
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_chest_number_setting_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_tenant_id uuid; v_festival_id uuid; v_old jsonb := '{}'::jsonb; v_new jsonb := '{}'::jsonb; v_action text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  v_festival_id := COALESCE(NEW.festival_id, OLD.festival_id);
  SELECT f.tenant_id INTO v_tenant_id FROM public.festival_calendar f WHERE f.id = v_festival_id;
  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;
  v_action := CASE WHEN TG_TABLE_NAME = 'festival_chest_number_controls' THEN 'chest_number_control_changed' ELSE 'chest_number_team_order_changed' END;
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
  VALUES(v_tenant_id,auth.uid(),v_action,TG_TABLE_NAME,v_festival_id,v_old,v_new);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS audit_festival_chest_controls ON public.festival_chest_number_controls;
CREATE TRIGGER audit_festival_chest_controls
AFTER INSERT OR UPDATE ON public.festival_chest_number_controls
FOR EACH ROW EXECUTE FUNCTION public.audit_chest_number_setting_change();

DROP TRIGGER IF EXISTS audit_festival_team_chest_slots ON public.festival_team_chest_slots;
CREATE TRIGGER audit_festival_team_chest_slots
AFTER INSERT OR UPDATE ON public.festival_team_chest_slots
FOR EACH ROW EXECUTE FUNCTION public.audit_chest_number_setting_change();

-- Team Leader RPCs share this scoped context function, so disabling the
-- portal invalidates existing sessions and every context-dependent operation.
CREATE OR REPLACE FUNCTION public.get_team_leader_context()
RETURNS TABLE(assignment_id uuid, parent_tenant_id uuid, festival_id uuid, festival_team_id uuid, organisation_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT a.id, ft.parent_tenant_id, ft.festival_id, ft.id, ft.organisation_id
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.festival_calendar f ON f.id = ft.festival_id
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.team_portal_settings s ON s.parent_tenant_id = ft.parent_tenant_id AND s.festival_id = ft.festival_id
  WHERE a.user_id = auth.uid() AND p.role = 'team_leader'
    AND a.status = 'active' AND a.revoked_at IS NULL AND a.valid_from <= now()
    AND (a.valid_until IS NULL OR a.valid_until > now()) AND ft.is_active AND f.is_active
    AND COALESCE(s.is_enabled,true) AND (s.opens_at IS NULL OR s.opens_at <= now())
    AND (s.closes_at IS NULL OR s.closes_at > now())
    AND public.tenant_module_enabled(ft.parent_tenant_id,'team_leader_portal')
  ORDER BY a.assigned_at DESC LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_team_leader_context_details()
RETURNS TABLE(assignment_id uuid, parent_tenant_id uuid, festival_id uuid, festival_team_id uuid, organisation_id uuid, team_name text, festival_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'pg_temp' AS $function$
  SELECT a.id,ft.parent_tenant_id,ft.festival_id,ft.id,ft.organisation_id,o.name,
    COALESCE(f.custom_name, 'Festival ' || f.festival_year::text)
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.organisations o ON o.id = ft.organisation_id
  JOIN public.festival_calendar f ON f.id = ft.festival_id
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.team_portal_settings s ON s.parent_tenant_id = ft.parent_tenant_id AND s.festival_id = ft.festival_id
  WHERE a.user_id = auth.uid() AND p.role = 'team_leader'
    AND a.status = 'active' AND a.revoked_at IS NULL AND a.valid_from <= now()
    AND (a.valid_until IS NULL OR a.valid_until > now()) AND ft.is_active AND f.is_active
    AND COALESCE(s.is_enabled,true) AND (s.opens_at IS NULL OR s.opens_at <= now())
    AND (s.closes_at IS NULL OR s.closes_at > now())
    AND public.tenant_module_enabled(ft.parent_tenant_id,'team_leader_portal')
  ORDER BY a.assigned_at DESC LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.team_leader_assignment_module_access(p_festival_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.festival_teams ft
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE ft.id = p_festival_team_id
      AND public.tenant_module_enabled(ft.parent_tenant_id, 'team_leader_management')
      AND (p.is_superadmin IS TRUE OR p.role = 'super_admin'
        OR (p.tenant_id = ft.parent_tenant_id AND p.role IN ('admin','tenant_admin','festival_admin'))
        OR (p.role = 'team_leader' AND EXISTS (
          SELECT 1 FROM public.team_leader_assignments a
          WHERE a.festival_team_id = ft.id AND a.user_id = auth.uid()
            AND a.status = 'active' AND a.revoked_at IS NULL)))
  );
$function$;
CREATE POLICY team_leader_management_module_gate ON public.team_leader_assignments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.team_leader_assignment_module_access(festival_team_id))
  WITH CHECK (public.team_leader_assignment_module_access(festival_team_id));

-- Keep the Team Leader account provisioning and reset RPCs behind the same
-- tenant switch; they use SECURITY DEFINER and cannot rely on the table RLS.
DO $function$
DECLARE v_definition text; v_marker text;
BEGIN
  v_definition := pg_catalog.pg_get_functiondef('public.get_team_leader_assignments_for_admin(uuid)'::regprocedure);
  IF position('tenant_module_enabled(f.tenant_id' IN v_definition) = 0 THEN
    v_marker := '  IF v_caller.id IS NULL';
    v_definition := replace(v_definition, v_marker,
      '  IF NOT EXISTS (SELECT 1 FROM public.festival_calendar f WHERE f.id = p_festival_id AND public.tenant_module_enabled(f.tenant_id, ''team_leader_management'')) THEN RAISE EXCEPTION ''Team Leader Management is disabled for this tenant.'' USING ERRCODE = ''42501''; END IF;' || pg_catalog.chr(10) || v_marker);
    IF position('tenant_module_enabled(f.tenant_id' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate Team Leader assignment management.'; END IF;
    EXECUTE v_definition;
  END IF;

  v_definition := pg_catalog.pg_get_functiondef('public.finalise_team_leader_provisioning(uuid,uuid,text,text)'::regprocedure);
  IF position('tenant_module_enabled(v_participant.tenant_id' IN v_definition) = 0 THEN
    v_marker := '  IF v_participant.user_id IS NOT NULL';
    v_definition := replace(v_definition, v_marker,
      '  IF NOT public.tenant_module_enabled(v_participant.tenant_id, ''team_leader_management'') THEN RAISE EXCEPTION ''Team Leader Management is disabled for this tenant.'' USING ERRCODE = ''42501''; END IF;' || pg_catalog.chr(10) || v_marker);
    IF position('tenant_module_enabled(v_participant.tenant_id' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate Team Leader provisioning.'; END IF;
    EXECUTE v_definition;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_team_leader_context_for_section(p_section text)
RETURNS TABLE(assignment_id uuid, parent_tenant_id uuid, festival_id uuid, festival_team_id uuid, organisation_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT context.* FROM public.get_team_leader_context() context
  WHERE public.tenant_module_section_enabled(context.parent_tenant_id, 'team_leader_portal', p_section)
$function$;

CREATE OR REPLACE FUNCTION public.require_team_leader_section(p_section text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT context.parent_tenant_id INTO v_tenant_id FROM public.get_team_leader_context() context LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501'; END IF;
  IF NOT public.tenant_module_section_enabled(v_tenant_id, 'team_leader_portal', p_section) THEN
    RAISE EXCEPTION 'This Team Leader Portal section is disabled for this tenant.' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.team_leader_section_enabled_for_current_user(p_section text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.get_team_leader_context() context
    WHERE public.tenant_module_section_enabled(context.parent_tenant_id, 'team_leader_portal', p_section)
  )
$function$;

CREATE OR REPLACE FUNCTION public.poster_studio_template_access(p_template_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.poster_templates template_row
    WHERE template_row.id = p_template_id
      AND public.authenticated_tenant_module_enabled(template_row.tenant_id, 'poster_studio')
  )
$function$;

-- The two poster modules share generated asset rows: Poster Studio creates
-- them and Media Center manages them. Keep the resource available while
-- either owning workflow is enabled, and disable it when both are off.
DROP POLICY IF EXISTS tenant_media_modules_gate ON public.generated_assets;
CREATE POLICY tenant_media_modules_gate ON public.generated_assets
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.authenticated_tenant_module_enabled(tenant_id, 'media_center') OR public.authenticated_tenant_module_enabled(tenant_id, 'poster_studio'))
  WITH CHECK (public.authenticated_tenant_module_enabled(tenant_id, 'media_center') OR public.authenticated_tenant_module_enabled(tenant_id, 'poster_studio'));

DROP POLICY IF EXISTS tenant_public_media_gate ON public.generated_assets;
CREATE POLICY tenant_public_media_gate ON public.generated_assets
  AS RESTRICTIVE FOR SELECT TO anon
  USING (public.public_page_media_enabled(tenant_id));

DROP POLICY IF EXISTS tenant_poster_studio_gate ON public.poster_templates;
CREATE POLICY tenant_poster_studio_gate ON public.poster_templates
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.authenticated_tenant_module_enabled(tenant_id, 'poster_studio'))
  WITH CHECK (public.authenticated_tenant_module_enabled(tenant_id, 'poster_studio'));

DROP POLICY IF EXISTS tenant_poster_studio_gate ON public.poster_drafts;
CREATE POLICY tenant_poster_studio_gate ON public.poster_drafts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.poster_studio_template_access(template_id))
  WITH CHECK (public.poster_studio_template_access(template_id));

DROP POLICY IF EXISTS tenant_poster_studio_gate ON public.poster_versions;
CREATE POLICY tenant_poster_studio_gate ON public.poster_versions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.poster_studio_template_access(template_id))
  WITH CHECK (public.poster_studio_template_access(template_id));

DROP POLICY IF EXISTS tenant_poster_studio_gate ON public.poster_approval_requests;
CREATE POLICY tenant_poster_studio_gate ON public.poster_approval_requests
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.poster_studio_template_access(template_id))
  WITH CHECK (public.poster_studio_template_access(template_id));

DROP POLICY IF EXISTS tenant_poster_studio_gate ON public.generated_posters;
CREATE POLICY tenant_poster_studio_gate ON public.generated_posters
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.authenticated_tenant_module_enabled(tenant_id, 'poster_studio'))
  WITH CHECK (public.authenticated_tenant_module_enabled(tenant_id, 'poster_studio'));

DROP POLICY IF EXISTS tenant_public_media_gate ON public.generated_posters;
CREATE POLICY tenant_public_media_gate ON public.generated_posters
  AS RESTRICTIVE FOR SELECT TO anon
  USING (public.public_page_media_enabled(tenant_id));

-- Apply section checks at the database boundary as well as in navigation.
-- SQL read functions receive a section-scoped context; procedural reads and
-- writes fail explicitly before their existing logic runs.
DO $team_section_guards$
DECLARE v_proc record; v_section text; v_definition text; v_guard text;
        v_open integer; v_close integer; v_body text;
BEGIN
  FOR v_proc IN
    SELECT p.oid, p.proname, l.lanname, p.proretset
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE n.nspname IN ('public', 'private')
      AND p.proname = ANY(ARRAY[
        'get_team_leader_schedule','get_team_leader_schedule_participants',
        'get_team_leader_published_results','get_team_leader_standings',
        'get_team_leader_participants','get_team_leader_item_limit_status','get_team_leader_participant_export_rows',
        'get_team_leader_announcements',
        'get_team_leader_participant_programs','get_team_leader_programs_page',
        'get_team_leader_eligible_group_member_ids','get_team_leader_program_group_roster',
        'get_team_leader_program_individual_roster','get_team_leader_programs','get_team_leader_programs_for_team',
        'get_team_leader_programs_for_team_with_locks','get_team_leader_completed_program_ids',
        'team_leader_assign_program','team_leader_assign_program_participants',
        'team_leader_create_general_entry','team_leader_mark_program_completed',
        'team_leader_request_individual_substitution','team_leader_request_group_substitution',
        'get_team_leader_individual_substitution_requests','get_team_leader_group_substitution_requests',
        'safe_unassign_registration','safe_remove_group_member','safe_delete_group_entry_if_unchanged'
      ])
  LOOP
    v_section := CASE
      WHEN v_proc.proname IN ('get_team_leader_schedule','get_team_leader_schedule_participants') THEN 'schedule'
      WHEN v_proc.proname IN ('get_team_leader_published_results','get_team_leader_standings') THEN 'results'
      WHEN v_proc.proname IN ('get_team_leader_participants','get_team_leader_item_limit_status','get_team_leader_participant_export_rows','get_team_leader_participant_programs') THEN 'participants'
      WHEN v_proc.proname = 'get_team_leader_announcements' THEN 'announcements'
      ELSE 'programs'
    END;
    v_definition := pg_catalog.pg_get_functiondef(v_proc.oid);
    v_guard := 'public.require_team_leader_section(''' || v_section || ''')';
    IF v_proc.lanname = 'plpgsql' THEN
      IF position(v_guard IN v_definition) = 0 THEN
        v_definition := regexp_replace(v_definition, E'\\mBEGIN\\s*', 'BEGIN' || pg_catalog.chr(10) || '  PERFORM ' || v_guard || ';' || pg_catalog.chr(10), 'i');
        IF position(v_guard IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not add Team Leader section guard to %', v_proc.proname; END IF;
        EXECUTE v_definition;
      END IF;
    ELSIF v_proc.lanname = 'sql' THEN
      IF position('get_team_leader_context()' IN v_definition) > 0 THEN
        v_definition := replace(v_definition, 'get_team_leader_context()',
          'get_team_leader_context_for_section(''' || v_section || ''')');
        EXECUTE v_definition;
      ELSIF v_proc.proretset THEN
        v_open := strpos(v_definition, 'AS $function$');
        IF v_open = 0 THEN RAISE EXCEPTION 'Could not locate SQL body for Team Leader function %', v_proc.proname; END IF;
        v_open := v_open + length('AS $function$');
        v_close := strpos(substr(v_definition, v_open), '$function$');
        IF v_close = 0 THEN RAISE EXCEPTION 'Could not locate end of SQL body for Team Leader function %', v_proc.proname; END IF;
        v_close := v_open + v_close - 1;
        v_body := btrim(substr(v_definition, v_open, v_close - v_open));
        v_body := regexp_replace(v_body, ';[[:space:]]*$', '');
        v_definition := substr(v_definition, 1, v_open - 1) || pg_catalog.chr(10)
          || 'SELECT section_rows.* FROM (' || v_body || ') section_rows'
          || ' WHERE public.team_leader_section_enabled_for_current_user(''' || v_section || ''')'
          || pg_catalog.chr(10) || substr(v_definition, v_close);
        EXECUTE v_definition;
      END IF;
    END IF;
  END LOOP;
END;
$team_section_guards$;

-- Judge token APIs derive the tenant from the approved token; both reads and
-- writes are denied when the tenant turns the Judge Portal off.
CREATE OR REPLACE FUNCTION public.judge_portal_token_enabled(p_token text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT p_token IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.judge_tokens jt
    WHERE (jt.token_hash = encode(extensions.digest(upper(btrim(p_token)), 'sha256'), 'hex')
        OR jt.token = upper(btrim(p_token))
        OR jt.token_hash = upper(btrim(p_token)))
      AND public.tenant_module_enabled(jt.tenant_id, 'judge_portal')
  )
$function$;

DO $function$
DECLARE v_definition text; v_marker text;
BEGIN
  v_definition := pg_catalog.pg_get_functiondef('public.validate_judge_token(text)'::regprocedure);
  IF position('judge_portal_token_enabled' IN v_definition) = 0 THEN
    v_definition := replace(v_definition, '  RETURN v_result;',
      '  IF v_result IS NOT NULL AND NOT public.judge_portal_token_enabled(p_token) THEN RETURN NULL; END IF;' || pg_catalog.chr(10) || '  RETURN v_result;');
    IF position('judge_portal_token_enabled' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate judge token validation.'; END IF;
    EXECUTE v_definition;
  END IF;

  v_definition := pg_catalog.pg_get_functiondef('public.request_judge_login(text,text,text)'::regprocedure);
  IF position('tenant_module_enabled(v_token.tenant_id' IN v_definition) = 0 THEN
    v_marker := '  IF NOT EXISTS (' || E'\n    SELECT 1\n    FROM public.schedule_judge_assignments a';
    v_definition := replace(v_definition, v_marker,
      '  IF NOT public.tenant_module_enabled(v_token.tenant_id, ''judge_portal'') THEN RAISE EXCEPTION ''Judge Portal is disabled for this tenant.'' USING ERRCODE = ''42501''; END IF;' || pg_catalog.chr(10) || v_marker);
    IF position('tenant_module_enabled(v_token.tenant_id' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate judge login requests.'; END IF;
    EXECUTE v_definition;
  END IF;

  v_definition := pg_catalog.pg_get_functiondef('public.get_judge_login_status(text)'::regprocedure);
  IF position('judge_portal_token_enabled' IN v_definition) = 0 THEN
    v_definition := replace(v_definition, '  RETURN COALESCE(v_status, ''invalid'');',
      '  IF NOT public.judge_portal_token_enabled(p_token) THEN RETURN ''invalid''; END IF;' || pg_catalog.chr(10) || '  RETURN COALESCE(v_status, ''invalid'');');
    IF position('judge_portal_token_enabled' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate judge login status.'; END IF;
    EXECUTE v_definition;
  END IF;

  v_definition := pg_catalog.pg_get_functiondef('public.get_judge_scoring_context(text)'::regprocedure);
  IF position('tenant_module_enabled(t.tenant_id' IN v_definition) = 0 THEN
    v_definition := replace(v_definition, '  SELECT pc.* INTO c',
      '  IF NOT public.tenant_module_enabled(t.tenant_id, ''judge_portal'') THEN RAISE EXCEPTION ''Judge Portal is disabled for this tenant.'' USING ERRCODE = ''42501''; END IF;' || pg_catalog.chr(10) || '  SELECT pc.* INTO c');
    IF position('tenant_module_enabled(t.tenant_id' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate judge scoring context.'; END IF;
    EXECUTE v_definition;
  END IF;

  v_definition := pg_catalog.pg_get_functiondef('public.generate_judge_token(uuid,uuid,uuid,uuid,boolean)'::regprocedure);
  IF position('tenant_module_enabled(p_tenant_id' IN v_definition) = 0 THEN
    v_definition := replace(v_definition, '  IF NOT p_force_refresh THEN',
      '  IF NOT public.tenant_module_enabled(p_tenant_id, ''judge_portal'') THEN RAISE EXCEPTION ''Judge Portal is disabled for this tenant.'' USING ERRCODE = ''42501''; END IF;' || pg_catalog.chr(10) || '  IF NOT p_force_refresh THEN');
    IF position('tenant_module_enabled(p_tenant_id' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate judge token generation.'; END IF;
    EXECUTE v_definition;
  END IF;

  FOREACH v_marker IN ARRAY ARRAY['approve_judge_login','reject_judge_login'] LOOP
    v_definition := pg_catalog.pg_get_functiondef((format('public.%I(uuid)', v_marker))::regprocedure);
    IF position('tenant_module_enabled(v_token.tenant_id' IN v_definition) = 0 THEN
      v_definition := replace(v_definition, '  IF v_token.status <> ''pending_approval''',
        '  IF NOT public.tenant_module_enabled(v_token.tenant_id, ''judge_portal'') THEN RAISE EXCEPTION ''Judge Portal is disabled for this tenant.'' USING ERRCODE = ''42501''; END IF;' || pg_catalog.chr(10) || '  IF v_token.status <> ''pending_approval''');
      IF position('tenant_module_enabled(v_token.tenant_id' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate %.', v_marker; END IF;
      EXECUTE v_definition;
    END IF;
  END LOOP;

  v_definition := pg_catalog.pg_get_functiondef('public.get_judge_registrations(text)'::regprocedure);
  v_marker := 'IF v_schedule_tenant_id IS NULL THEN RAISE EXCEPTION ''Event schedule was not found.''; END IF;';
  IF position('tenant_module_enabled(v_schedule_tenant_id' IN v_definition) = 0 THEN
    v_definition := replace(v_definition, v_marker, v_marker || E'\n  IF NOT public.tenant_module_enabled(v_schedule_tenant_id, ''judge_portal'') THEN RAISE EXCEPTION ''Judge Portal is disabled for this tenant.'' USING ERRCODE = ''42501''; END IF;');
    IF position('tenant_module_enabled(v_schedule_tenant_id' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate get_judge_registrations by tenant settings.'; END IF;
    EXECUTE v_definition;
  END IF;
  v_definition := pg_catalog.pg_get_functiondef('public.upsert_judge_mark(text,uuid,jsonb,numeric,text,text,numeric,jsonb)'::regprocedure);
  IF position('tenant_module_enabled(v_schedule_tenant_id' IN v_definition) = 0 THEN
    v_definition := regexp_replace(v_definition,
      E'(IF v_schedule_tenant_id IS NULL THEN\\s*RAISE EXCEPTION ''Event schedule was not found\\.'';\\s*END IF;)',
      E'\\1' || pg_catalog.chr(10) || '  IF NOT public.tenant_module_enabled(v_schedule_tenant_id, ''judge_portal'') THEN RAISE EXCEPTION ''Judge Portal is disabled for this tenant.'' USING ERRCODE = ''42501''; END IF;', 'i');
    IF position('tenant_module_enabled(v_schedule_tenant_id' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate upsert_judge_mark by tenant settings.'; END IF;
    EXECUTE v_definition;
  END IF;
END;
$function$;

-- Smart Announcer admin operations and public token reads all pass through
-- these two assertions/entry points.
CREATE OR REPLACE FUNCTION public.smart_announcer_assert_admin(p_tenant_id uuid, p_festival_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.festival_calendar f ON f.id = p_festival_id AND f.tenant_id = p_tenant_id
    JOIN public.tenants t ON t.id = f.tenant_id AND t.access_disabled = false
    WHERE p.id = auth.uid() AND (COALESCE(p.is_superadmin,false) OR
      (p.tenant_id = p_tenant_id AND p.role IN ('tenant_admin','festival_admin','admin')))
  ) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.tenant_module_enabled(p_tenant_id,'smart_announcer') THEN
    RAISE EXCEPTION 'Smart Announcer is disabled for this tenant.' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- The public token wrappers use these helpers for legacy links and PIN links.
-- Checking both paths here keeps already-issued sessions from bypassing OFF.
CREATE OR REPLACE FUNCTION public.smart_announcer_legacy_token_allowed(p_token text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF p_token IS NULL OR pg_catalog.length(p_token) <> 64 THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.smart_announcer_credentials c
    JOIN public.tenants t ON t.id = c.tenant_id AND t.access_disabled IS FALSE
    WHERE c.token_hash = extensions.digest(p_token, 'sha256')
      AND c.pin_hash IS NULL AND c.revoked_at IS NULL AND c.expires_at > pg_catalog.now()
      AND public.tenant_module_enabled(c.tenant_id, 'smart_announcer')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.smart_announcer_access_mode(p_token text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF p_token IS NULL OR pg_catalog.length(p_token) <> 64 THEN RETURN 'invalid'; END IF;
  RETURN COALESCE((
    SELECT CASE WHEN c.pin_hash IS NULL THEN 'legacy' ELSE 'pin' END
    FROM public.smart_announcer_credentials c
    JOIN public.tenants t ON t.id = c.tenant_id AND t.access_disabled IS FALSE
    WHERE c.token_hash = extensions.digest(p_token, 'sha256')
      AND c.revoked_at IS NULL AND c.expires_at > pg_catalog.now()
      AND public.tenant_module_enabled(c.tenant_id, 'smart_announcer')
  ), 'invalid');
END;
$function$;

CREATE OR REPLACE FUNCTION public.smart_announcer_check_pin(p_token text, p_pin text, p_reset_on_success boolean)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE c public.smart_announcer_credentials%ROWTYPE; v_failures integer; v_window timestamptz; v_valid boolean := false;
BEGIN
  IF p_token IS NULL OR pg_catalog.length(p_token) <> 64 THEN RETURN 'invalid'; END IF;
  SELECT credential.* INTO c FROM public.smart_announcer_credentials credential
  JOIN public.tenants t ON t.id = credential.tenant_id AND t.access_disabled IS FALSE
  WHERE credential.token_hash = extensions.digest(p_token, 'sha256') AND credential.pin_hash IS NOT NULL
    AND credential.revoked_at IS NULL AND credential.expires_at > pg_catalog.now()
  FOR UPDATE OF credential;
  IF NOT FOUND OR NOT public.tenant_module_enabled(c.tenant_id, 'smart_announcer') THEN RETURN 'invalid'; END IF;
  IF c.pin_locked_until > pg_catalog.now() THEN RETURN 'locked'; END IF;
  IF p_pin ~ '^[0-9]{4}$' THEN v_valid := extensions.crypt(p_pin, c.pin_hash) = c.pin_hash; END IF;
  IF NOT v_valid THEN
    IF c.pin_failure_window_started_at IS NULL OR c.pin_failure_window_started_at <= pg_catalog.now() - interval '15 minutes'
       OR (c.pin_locked_until IS NOT NULL AND c.pin_locked_until <= pg_catalog.now()) THEN
      v_failures := 1; v_window := pg_catalog.now();
    ELSE v_failures := c.pin_failures + 1; v_window := c.pin_failure_window_started_at; END IF;
    UPDATE public.smart_announcer_credentials SET pin_failures = v_failures,
      pin_failure_window_started_at = v_window,
      pin_locked_until = CASE WHEN v_failures >= 5 THEN pg_catalog.now() + interval '15 minutes' ELSE NULL END WHERE id = c.id;
    RETURN CASE WHEN v_failures >= 5 THEN 'locked' ELSE 'invalid' END;
  END IF;
  IF p_reset_on_success OR (c.pin_locked_until IS NOT NULL AND c.pin_locked_until <= pg_catalog.now())
     OR (c.pin_failure_window_started_at IS NOT NULL AND c.pin_failure_window_started_at <= pg_catalog.now() - interval '15 minutes') THEN
    UPDATE public.smart_announcer_credentials SET pin_failures = 0, pin_failure_window_started_at = NULL, pin_locked_until = NULL WHERE id = c.id;
  END IF;
  RETURN 'ok';
END;
$function$;
REVOKE ALL ON FUNCTION public.smart_announcer_legacy_token_allowed(text), public.smart_announcer_access_mode(text), public.smart_announcer_check_pin(text,text,boolean) FROM PUBLIC, anon, authenticated;

-- The shared administrator assertion covers Stage Management admin RPCs.
CREATE OR REPLACE FUNCTION public.stage_assert_admin_access()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_tenant_id uuid; v_role text; v_is_superadmin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Stage Management requires an authenticated account.' USING ERRCODE = '42501'; END IF;
  SELECT p.tenant_id,p.role,COALESCE(p.is_superadmin,false)
    INTO v_tenant_id,v_role,v_is_superadmin FROM public.profiles p WHERE p.id = auth.uid();
  IF v_tenant_id IS NULL OR (v_role <> 'admin' AND NOT v_is_superadmin) THEN
    RAISE EXCEPTION 'Stage Management is restricted to festival administrators.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.tenant_module_enabled(v_tenant_id,'stage_management') THEN
    RAISE EXCEPTION 'Stage Management is disabled for this tenant.' USING ERRCODE = '42501';
  END IF;
  RETURN v_tenant_id;
END;
$function$;

-- All venue portal PIN based reads and writes call this verifier.
CREATE OR REPLACE FUNCTION stage_portal_private.assert_pin(p_venue_id uuid, p_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_code stage_portal_private.venue_access_codes%ROWTYPE;
        v_attempt stage_portal_private.pin_attempts%ROWTYPE;
        v_headers jsonb; v_attempt_key text; v_tenant_id uuid;
BEGIN
  IF p_venue_id IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN RETURN 'Invalid stage link or PIN.'; END IF;
  SELECT v.tenant_id INTO v_tenant_id FROM public.venues v WHERE v.id = p_venue_id;
  IF v_tenant_id IS NULL THEN RETURN 'Invalid stage link or PIN.'; END IF;
  IF NOT public.tenant_module_enabled(v_tenant_id,'stage_management') THEN RETURN 'Stage Management is disabled for this tenant.'; END IF;
  v_headers := COALESCE(NULLIF(pg_catalog.current_setting('request.headers',true), '')::jsonb,'{}'::jsonb);
  v_attempt_key := pg_catalog.md5(COALESCE(v_headers->>'cf-connecting-ip',v_headers->>'x-real-ip',v_headers->>'x-forwarded-for','unknown'));
  SELECT * INTO v_attempt FROM stage_portal_private.pin_attempts a WHERE a.venue_id = p_venue_id AND a.attempt_key = v_attempt_key;
  IF FOUND AND v_attempt.locked_until > pg_catalog.now() THEN RETURN 'Too many incorrect PIN attempts. Please wait before trying again.'; END IF;
  SELECT * INTO v_code FROM stage_portal_private.venue_access_codes c WHERE c.venue_id = p_venue_id;
  IF NOT FOUND OR v_code.pin <> p_pin THEN
    INSERT INTO stage_portal_private.pin_attempts(venue_id,attempt_key,attempts,window_started_at,locked_until)
    VALUES(p_venue_id,v_attempt_key,1,pg_catalog.now(),NULL)
    ON CONFLICT(venue_id,attempt_key) DO UPDATE SET
      attempts = CASE WHEN stage_portal_private.pin_attempts.window_started_at < pg_catalog.now()-interval '10 minutes' THEN 1 ELSE stage_portal_private.pin_attempts.attempts+1 END,
      window_started_at = CASE WHEN stage_portal_private.pin_attempts.window_started_at < pg_catalog.now()-interval '10 minutes' THEN pg_catalog.now() ELSE stage_portal_private.pin_attempts.window_started_at END,
      locked_until = CASE WHEN stage_portal_private.pin_attempts.window_started_at < pg_catalog.now()-interval '10 minutes' THEN NULL WHEN stage_portal_private.pin_attempts.attempts+1 >= 8 THEN pg_catalog.now()+interval '5 minutes' ELSE NULL END;
    RETURN 'Incorrect PIN.';
  END IF;
  DELETE FROM stage_portal_private.pin_attempts a WHERE a.venue_id = p_venue_id AND a.attempt_key = v_attempt_key;
  RETURN NULL;
END;
$function$;

-- Direct Entry and Judge Portal are independent publishing modes.
DO $function$
DECLARE v_definition text;
BEGIN
  v_definition := pg_catalog.pg_get_functiondef('public.publish_competition_results(uuid,integer,jsonb,text,uuid,text,integer)'::regprocedure);
  IF position('tenant_module_enabled(owner' IN v_definition) = 0 THEN
    v_definition := replace(v_definition,
      'PERFORM scoring_private.assert_admin(owner);',
      'PERFORM scoring_private.assert_admin(owner);' || E'\n  IF p_mode = ''manual'' AND NOT public.tenant_module_enabled(owner, ''direct_entry'') THEN RAISE EXCEPTION ''Direct Entry is disabled for this tenant.'' USING ERRCODE = ''42501''; END IF;' || E'\n  IF p_mode = ''judges'' AND NOT public.tenant_module_enabled(owner, ''judge_portal'') THEN RAISE EXCEPTION ''Judge Portal is disabled for this tenant.'' USING ERRCODE = ''42501''; END IF;');
    EXECUTE v_definition;
  END IF;
END;
$function$;

-- Public read APIs stay tenant-scoped and return no rows for disabled modules.
CREATE OR REPLACE FUNCTION public.get_public_schedules_scoped(p_tenant_id uuid, p_festival_id uuid)
RETURNS TABLE(
  schedule_id uuid, festival_id uuid, item_id uuid, venue_id uuid,
  start_time timestamptz, end_time timestamptz, status text,
  venue_name text, venue_location text, item_name text, item_name_ml text,
  item_code text, item_type text, item_category_codes text[],
  is_published boolean, has_results boolean, has_marks boolean, has_codes boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT s.id,s.festival_id,s.item_id,s.venue_id,s.start_time,s.end_time,s.status,
    v.name,v.location,i.item_name_en,i.item_name_ml,i.item_code,i.item_type,
    COALESCE(i.category_codes,ARRAY[]::text[]),
    EXISTS(SELECT 1 FROM public.results r WHERE r.schedule_id=s.id AND r.tenant_id=p_tenant_id AND r.festival_id=p_festival_id AND r.published IS TRUE AND r.public_visible IS TRUE AND COALESCE(r.result_status,'draft')='published'),
    EXISTS(SELECT 1 FROM public.results r WHERE r.schedule_id=s.id AND r.tenant_id=p_tenant_id AND r.festival_id=p_festival_id),
    EXISTS(SELECT 1 FROM public.mark_entries m WHERE m.schedule_id=s.id AND m.tenant_id=p_tenant_id AND m.is_final IS TRUE),
    EXISTS(SELECT 1 FROM public.registrations r WHERE r.tenant_id=p_tenant_id AND r.festival_id=p_festival_id AND r.item_id=s.item_id AND r.code_letter IS NOT NULL)
  FROM public.schedules s
  JOIN public.festival_calendar f ON f.id=s.festival_id AND f.tenant_id=s.tenant_id
  LEFT JOIN public.items i ON i.id=s.item_id AND i.tenant_id=p_tenant_id AND i.festival_id=p_festival_id
  LEFT JOIN public.venues v ON v.id=s.venue_id AND v.tenant_id=p_tenant_id AND v.festival_id=p_festival_id
  WHERE p_tenant_id IS NOT NULL AND p_festival_id IS NOT NULL
    AND s.tenant_id=p_tenant_id AND s.festival_id=p_festival_id AND s.is_public_visible IS TRUE
    AND public.tenant_module_section_enabled(p_tenant_id,'public_page','schedule')
  ORDER BY s.start_time NULLS LAST,s.id;
$function$;
ALTER FUNCTION public.get_public_schedules_scoped(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_schedules_scoped(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_schedules_scoped(uuid,uuid) TO anon, authenticated, service_role;

-- Append the same tenant gate to the existing, larger public result RPCs while
-- preserving their carefully maintained result projection and grants.
DO $function$
DECLARE v_definition text;
BEGIN
  v_definition := pg_catalog.pg_get_functiondef('public.get_public_leaderboard(uuid,uuid)'::regprocedure);
  IF position('tenant_module_enabled(v_festival_tenant_id' IN v_definition) = 0 THEN
    -- This RPC currently delegates data reads to get_public_leaderboard_unmasked
    -- and resolves the requested festival into v_festival_id. Resolve its owner
    -- at that point so the gate works with the live wrapper's current shape.
    IF position('v_festival_tenant_id uuid' IN v_definition) = 0 THEN
      v_definition := regexp_replace(v_definition,
        E'(v_festival_id uuid;)', E'\\1' || pg_catalog.chr(10) || '  v_festival_tenant_id uuid;', 'i');
    END IF;
    IF position('v_festival_tenant_id uuid' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Could not add tenant context to get_public_leaderboard.';
    END IF;
    v_definition := replace(v_definition,
      '  SELECT COALESCE(settings.show_competition_points_grades, true)',
      '  SELECT tenant_id INTO v_festival_tenant_id FROM public.festival_calendar WHERE id = v_festival_id;' || pg_catalog.chr(10) ||
      '  IF v_festival_tenant_id IS NULL OR NOT public.tenant_module_enabled(v_festival_tenant_id, ''public_page'') OR NOT public.tenant_module_enabled(v_festival_tenant_id, ''public_leaderboard'') OR NOT public.tenant_module_section_enabled(v_festival_tenant_id, ''public_page'', ''results'') THEN RETURN; END IF;' || pg_catalog.chr(10) || pg_catalog.chr(10) ||
      '  SELECT COALESCE(settings.show_competition_points_grades, true)');
    IF position('tenant_module_enabled(v_festival_tenant_id' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate get_public_leaderboard by tenant settings.'; END IF;
    EXECUTE v_definition;
  END IF;
  v_definition := pg_catalog.pg_get_functiondef('public.get_public_published_results(uuid,uuid,boolean)'::regprocedure);
  IF position('tenant_module_section_enabled(v_festival_tenant_id' IN v_definition) = 0 THEN
    v_definition := regexp_replace(v_definition,
      E'(SELECT tenant_id, level[[:space:]]+INTO v_festival_tenant_id, v_festival_level[[:space:]]+FROM (public\\.)?festival_calendar[[:space:]]+WHERE id = v_festival_id;)',
      E'\\1' || pg_catalog.chr(10) || '  IF NOT public.tenant_module_section_enabled(v_festival_tenant_id, ''public_page'', ''results'') THEN RETURN; END IF;', 'i');
    IF position('tenant_module_section_enabled(v_festival_tenant_id' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate get_public_published_results by tenant settings.'; END IF;
    EXECUTE v_definition;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_verification_status(p_tenant_id uuid)
RETURNS TABLE(schedule_id uuid, has_results boolean, has_marks boolean, has_codes boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT s.id,
    EXISTS(SELECT 1 FROM public.results r WHERE r.schedule_id=s.id AND r.tenant_id=s.tenant_id AND r.festival_id=s.festival_id),
    EXISTS(SELECT 1 FROM public.mark_entries m WHERE m.schedule_id=s.id AND m.tenant_id=s.tenant_id AND m.is_final IS TRUE),
    EXISTS(SELECT 1 FROM public.registrations r WHERE r.tenant_id=s.tenant_id AND r.festival_id=s.festival_id AND r.item_id=s.item_id AND r.code_letter IS NOT NULL)
  FROM public.schedules s
  WHERE p_tenant_id IS NOT NULL AND s.tenant_id=p_tenant_id AND s.is_public_visible IS TRUE
    AND public.tenant_module_section_enabled(p_tenant_id,'public_page','schedule');
$function$;
ALTER FUNCTION public.get_public_verification_status(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_verification_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_verification_status(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_participant_results_scoped(p_tenant_id uuid, p_festival_id uuid)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT to_jsonb(result_row)
  FROM public.get_public_published_results(p_tenant_id, p_festival_id, true) result_row
  WHERE p_tenant_id IS NOT NULL AND p_festival_id IS NOT NULL
    AND public.tenant_module_section_enabled(p_tenant_id, 'public_page', 'results')
    AND public.tenant_module_section_enabled(p_tenant_id, 'public_page', 'participant_results');
$function$;
ALTER FUNCTION public.get_public_participant_results_scoped(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_participant_results_scoped(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_participant_results_scoped(uuid,uuid) TO anon, authenticated, service_role;

-- Prevent public profiles from revealing participant results when the
-- tenant's public page or participant-results subsection is disabled.
DO $function$
DECLARE v_definition text;
BEGIN
  v_definition := pg_catalog.pg_get_functiondef('public.get_public_candidate_profile(text)'::regprocedure);
  IF position('participant_results' IN v_definition) = 0 THEN
    v_definition := replace(v_definition,
      '  IF v_participant.id IS NULL THEN',
      '  IF v_participant.id IS NULL OR NOT public.tenant_module_section_enabled(v_participant.tenant_id, ''public_page'', ''results'') OR NOT public.tenant_module_section_enabled(v_participant.tenant_id, ''public_page'', ''participant_results'') THEN');
    -- The source projection must retain the tenant id internally for this gate.
    v_definition := regexp_replace(v_definition,
      E'(p\\.id,[[:space:]]+)(p\\.profile_slug,)', E'\\1p.tenant_id,' || pg_catalog.chr(10) || E'    \\2', 'i');
    IF position('p.tenant_id' IN v_definition) = 0 OR position('participant_results' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Could not gate public candidate profiles by tenant settings.';
    END IF;
    EXECUTE v_definition;
  END IF;
END;
$function$;

-- A public unit profile can contain participant and result data, so it follows
-- both the public-page switch and the public leaderboard/results switches.
DO $function$
DECLARE v_definition text;
BEGIN
  v_definition := pg_catalog.pg_get_functiondef('public.get_public_unit_profile(uuid)'::regprocedure);
  IF position('tenant_module_section_enabled' IN v_definition) = 0 THEN
    v_definition := regexp_replace(v_definition,
      E'(IF v_org\\.id IS NULL THEN[[:space:]]*RETURN NULL;[[:space:]]*END IF;)',
      E'\\1' || pg_catalog.chr(10) || '  IF NOT public.tenant_module_enabled(COALESCE(v_org.tenant_id, (SELECT parent_org.tenant_id FROM public.organisations parent_org WHERE parent_org.id = v_org.parent_id)), ''public_page'') OR NOT public.tenant_module_enabled(COALESCE(v_org.tenant_id, (SELECT parent_org.tenant_id FROM public.organisations parent_org WHERE parent_org.id = v_org.parent_id)), ''public_leaderboard'') OR NOT public.tenant_module_section_enabled(COALESCE(v_org.tenant_id, (SELECT parent_org.tenant_id FROM public.organisations parent_org WHERE parent_org.id = v_org.parent_id)), ''public_page'', ''results'') THEN RETURN NULL; END IF;', 'i');
    IF position('tenant_module_section_enabled' IN v_definition) = 0 THEN RAISE EXCEPTION 'Could not gate public unit profiles by tenant settings.'; END IF;
    EXECUTE v_definition;
  END IF;
END;
$function$;

-- Lock down every function added above; client access is only through the
-- named, role-checked RPCs.
REVOKE ALL ON FUNCTION public.seed_tenant_feature_settings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tenant_module_enabled(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tenant_module_section_enabled(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.authenticated_tenant_module_enabled(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.public_page_media_enabled(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.poster_studio_template_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_leader_assignment_module_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_team_leader_context_for_section(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.require_team_leader_section(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_leader_section_enabled_for_current_user(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_tenant_feature_settings(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_tenant_feature_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.super_get_tenant_control_data(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.super_get_tenant_talents(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.super_update_tenant_modules(uuid,jsonb,jsonb,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.super_update_festival_name(uuid,uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.super_update_organisation_name(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.super_update_talent_name(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.super_update_chest_settings(uuid,uuid,text,integer,text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.super_list_tenant_audit_logs(uuid,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_chest_number_setting_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.judge_portal_token_enabled(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_feature_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authenticated_tenant_module_enabled(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_page_media_enabled(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poster_studio_template_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_leader_assignment_module_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_leader_context_for_section(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.require_team_leader_section(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_leader_section_enabled_for_current_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_feature_settings(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_participant_results_scoped(uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.super_get_tenant_control_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_get_tenant_talents(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_update_tenant_modules(uuid,jsonb,jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_update_festival_name(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_update_organisation_name(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_update_talent_name(uuid,uuid,uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_update_chest_settings(uuid,uuid,text,integer,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_list_tenant_audit_logs(uuid,integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
