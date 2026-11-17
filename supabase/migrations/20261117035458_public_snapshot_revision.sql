-- A tenant-wide revision is deliberately coarse: every public renderer shares
-- one publication boundary, including changes to the active festival.
CREATE TABLE public.public_snapshot_revisions (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_snapshot_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_snapshot_revisions FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.bump_public_snapshot_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_tenant uuid;
  v_new_tenant uuid;
  v_old_parent_tenant uuid;
  v_new_parent_tenant uuid;
  v_old_public boolean := false;
  v_new_public boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NULL;
  END IF;

  -- A draft result cannot affect a public snapshot. Publish, Hide, and edits
  -- to already published rows still increment the revision transactionally.
  IF TG_TABLE_NAME = 'results' THEN
    IF TG_OP <> 'INSERT' THEN
      v_old_public := OLD.published IS TRUE AND OLD.public_visible IS TRUE
        AND OLD.result_status IN ('published', 'ready');
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_new_public := NEW.published IS TRUE AND NEW.public_visible IS TRUE
        AND NEW.result_status IN ('published', 'ready');
    END IF;
    IF NOT (v_old_public OR v_new_public) THEN RETURN NULL; END IF;
  END IF;
  IF TG_TABLE_NAME = 'mark_entries' THEN
    IF TG_OP <> 'INSERT' THEN v_old_public := OLD.is_final IS TRUE; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_public := NEW.is_final IS TRUE; END IF;
    IF NOT (v_old_public OR v_new_public) THEN RETURN NULL; END IF;
  END IF;

  IF TG_TABLE_NAME = 'result_team_awards' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT r.tenant_id INTO v_old_tenant FROM public.results r WHERE r.id = OLD.result_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT r.tenant_id INTO v_new_tenant FROM public.results r WHERE r.id = NEW.result_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'group_members' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT r.tenant_id INTO v_old_tenant FROM public.registrations r WHERE r.id = OLD.registration_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT r.tenant_id INTO v_new_tenant FROM public.registrations r WHERE r.id = NEW.registration_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'festival_teams' THEN
    IF TG_OP <> 'INSERT' THEN v_old_tenant := OLD.parent_tenant_id; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_tenant := NEW.parent_tenant_id; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN v_old_tenant := OLD.tenant_id; END IF;
    IF TG_OP <> 'DELETE' THEN v_new_tenant := NEW.tenant_id; END IF;
  END IF;

  -- Public team rosters may include a child-tenant unit whose parent belongs
  -- to the festival tenant. A rename must invalidate that parent's snapshot.
  IF TG_TABLE_NAME = 'organisations' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT tenant_id INTO v_old_parent_tenant FROM public.organisations WHERE id = OLD.parent_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT tenant_id INTO v_new_parent_tenant FROM public.organisations WHERE id = NEW.parent_id;
    END IF;
  END IF;

  IF v_old_tenant IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenants WHERE id = v_old_tenant) THEN
    INSERT INTO public.public_snapshot_revisions (tenant_id) VALUES (v_old_tenant)
    ON CONFLICT (tenant_id) DO UPDATE SET
      revision = public.public_snapshot_revisions.revision + 1,
      changed_at = now();
  END IF;
  IF v_new_tenant IS NOT NULL AND v_new_tenant IS DISTINCT FROM v_old_tenant
      AND EXISTS (SELECT 1 FROM public.tenants WHERE id = v_new_tenant) THEN
    INSERT INTO public.public_snapshot_revisions (tenant_id) VALUES (v_new_tenant)
    ON CONFLICT (tenant_id) DO UPDATE SET
      revision = public.public_snapshot_revisions.revision + 1,
      changed_at = now();
  END IF;
  IF v_old_parent_tenant IS NOT NULL AND v_old_parent_tenant IS DISTINCT FROM v_old_tenant
      AND EXISTS (SELECT 1 FROM public.tenants WHERE id = v_old_parent_tenant) THEN
    INSERT INTO public.public_snapshot_revisions (tenant_id) VALUES (v_old_parent_tenant)
    ON CONFLICT (tenant_id) DO UPDATE SET revision = public.public_snapshot_revisions.revision + 1, changed_at = now();
  END IF;
  IF v_new_parent_tenant IS NOT NULL AND v_new_parent_tenant IS DISTINCT FROM v_new_tenant
      AND v_new_parent_tenant IS DISTINCT FROM v_old_parent_tenant
      AND EXISTS (SELECT 1 FROM public.tenants WHERE id = v_new_parent_tenant) THEN
    INSERT INTO public.public_snapshot_revisions (tenant_id) VALUES (v_new_parent_tenant)
    ON CONFLICT (tenant_id) DO UPDATE SET revision = public.public_snapshot_revisions.revision + 1, changed_at = now();
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_public_snapshot_revision() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'results', 'result_team_awards', 'schedules', 'items', 'venues',
    'registrations', 'participants', 'organisations', 'group_members',
    'mark_entries', 'points_config', 'grace_marks', 'festival_teams',
    'festival_calendar', 'festival_leaderboard_settings', 'tenant_feature_settings'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_public_snapshot_revision()',
      'public_snapshot_revision_' || v_table, v_table
    );
  END LOOP;
END;
$$;

CREATE FUNCTION public.get_public_snapshot_revision(p_tenant_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (public.get_public_tenant_feature_settings(p_tenant_id)->>'public_page')::boolean IS TRUE
    THEN COALESCE((SELECT revision FROM public.public_snapshot_revisions WHERE tenant_id = p_tenant_id), 0)
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.get_public_snapshot_revision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_snapshot_revision(uuid) TO anon, authenticated, service_role;
