-- Migration: Poster Studio Workflow, Item-Scoped Result Numbers, and Tenant-Isolated Security
-- Preserves existing records while enabling draft/published visibility sync, superseding, and strict RLS.

BEGIN;

-- 1. Additive schema columns
ALTER TABLE public.poster_templates
  ADD COLUMN IF NOT EXISTS background_transform jsonb,
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.file_metadata
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.generated_assets
  ADD COLUMN IF NOT EXISTS visibility_status text NOT NULL DEFAULT 'published'
    CHECK (visibility_status IN ('draft', 'pending_approval', 'published', 'hidden', 'archived')),
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.generated_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_fingerprint text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_generated_assets_festival_event_current
  ON public.generated_assets(festival_id, event_id, is_current);

-- 2. Item-scoped public_result_no assignment (1, 2, 3... per competition item)
CREATE OR REPLACE FUNCTION public.assign_public_result_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_existing_no INTEGER;
  v_next_no INTEGER;
  v_scope_key TEXT;
  v_item_guc TEXT;
  v_max_guc TEXT;
  v_cached_item TEXT;
  v_cached_max TEXT;
BEGIN
  IF NEW.public_visible IS TRUE AND NEW.public_result_no IS NULL THEN
    v_scope_key := COALESCE(NEW.tenant_id::text, '00000000') || ':' || COALESCE(NEW.festival_id::text, '00000000');
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('assign_public_result_no'),
      pg_catalog.hashtext(v_scope_key)
    );

    IF NEW.item_id IS NOT NULL THEN
      v_item_guc := 'sahi_resno.i_' || replace(NEW.item_id::text, '-', '') || '_' || replace(COALESCE(NEW.festival_id::text, '0'), '-', '');
      v_cached_item := NULLIF(pg_catalog.current_setting(v_item_guc, true), '');
      IF v_cached_item IS NOT NULL THEN
        NEW.public_result_no := v_cached_item::integer;
        RETURN NEW;
      END IF;

      SELECT r.public_result_no INTO v_existing_no
      FROM public.results r
      WHERE r.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
        AND r.festival_id IS NOT DISTINCT FROM NEW.festival_id
        AND r.item_id = NEW.item_id
        AND r.public_result_no IS NOT NULL
      ORDER BY r.public_result_no ASC
      LIMIT 1;

      IF v_existing_no IS NOT NULL THEN
        NEW.public_result_no := v_existing_no;
        PERFORM pg_catalog.set_config(v_item_guc, v_existing_no::text, true);
        RETURN NEW;
      END IF;
    END IF;

    v_max_guc := 'sahi_resno.m_' || replace(COALESCE(NEW.tenant_id::text, '0'), '-', '') || '_' || replace(COALESCE(NEW.festival_id::text, '0'), '-', '');
    v_cached_max := NULLIF(pg_catalog.current_setting(v_max_guc, true), '');
    IF v_cached_max IS NOT NULL THEN
      v_next_no := v_cached_max::integer + 1;
    ELSE
      SELECT COALESCE(MAX(r.public_result_no), 0) + 1 INTO v_next_no
      FROM public.results r
      WHERE r.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
        AND (NEW.festival_id IS NULL OR r.festival_id = NEW.festival_id);
    END IF;

    NEW.public_result_no := v_next_no;
    PERFORM pg_catalog.set_config(v_max_guc, v_next_no::text, true);
    IF v_item_guc IS NOT NULL THEN
      PERFORM pg_catalog.set_config(v_item_guc, v_next_no::text, true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_public_result_no_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_existing_no INTEGER;
  v_next_no INTEGER;
  v_scope_key TEXT;
  v_item_guc TEXT;
  v_max_guc TEXT;
  v_cached_item TEXT;
  v_cached_max TEXT;
BEGIN
  IF NEW.public_visible IS TRUE AND NEW.public_result_no IS NULL THEN
    v_scope_key := COALESCE(NEW.tenant_id::text, '00000000') || ':' || COALESCE(NEW.festival_id::text, '00000000');
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('assign_public_result_no'),
      pg_catalog.hashtext(v_scope_key)
    );

    IF NEW.item_id IS NOT NULL THEN
      v_item_guc := 'sahi_resno.i_' || replace(NEW.item_id::text, '-', '') || '_' || replace(COALESCE(NEW.festival_id::text, '0'), '-', '');
      v_cached_item := NULLIF(pg_catalog.current_setting(v_item_guc, true), '');
      IF v_cached_item IS NOT NULL THEN
        NEW.public_result_no := v_cached_item::integer;
        RETURN NEW;
      END IF;

      SELECT r.public_result_no INTO v_existing_no
      FROM public.results r
      WHERE r.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
        AND r.festival_id IS NOT DISTINCT FROM NEW.festival_id
        AND r.item_id = NEW.item_id
        AND r.public_result_no IS NOT NULL
      ORDER BY r.public_result_no ASC
      LIMIT 1;

      IF v_existing_no IS NOT NULL THEN
        NEW.public_result_no := v_existing_no;
        PERFORM pg_catalog.set_config(v_item_guc, v_existing_no::text, true);
        RETURN NEW;
      END IF;
    END IF;

    v_max_guc := 'sahi_resno.m_' || replace(COALESCE(NEW.tenant_id::text, '0'), '-', '') || '_' || replace(COALESCE(NEW.festival_id::text, '0'), '-', '');
    v_cached_max := NULLIF(pg_catalog.current_setting(v_max_guc, true), '');
    IF v_cached_max IS NOT NULL THEN
      v_next_no := v_cached_max::integer + 1;
    ELSE
      SELECT COALESCE(MAX(r.public_result_no), 0) + 1 INTO v_next_no
      FROM public.results r
      WHERE r.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
        AND (NEW.festival_id IS NULL OR r.festival_id = NEW.festival_id);
    END IF;

    NEW.public_result_no := v_next_no;
    PERFORM pg_catalog.set_config(v_max_guc, v_next_no::text, true);
    IF v_item_guc IS NOT NULL THEN
      PERFORM pg_catalog.set_config(v_item_guc, v_next_no::text, true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Automatic Result -> Poster Visibility Sync Trigger
CREATE OR REPLACE FUNCTION public.sync_generated_assets_visibility_from_result()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_item_is_public BOOLEAN := false;
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.results r
      WHERE r.festival_id IS NOT DISTINCT FROM NEW.festival_id
        AND r.item_id = NEW.item_id
        AND r.published IS TRUE
        AND COALESCE(r.result_status, 'draft') = 'published'
        AND r.public_visible IS TRUE
    ) INTO v_item_is_public;

    UPDATE public.generated_assets
    SET visibility_status = CASE WHEN v_item_is_public THEN 'published' ELSE 'draft' END,
        updated_at = now()
    WHERE festival_id IS NOT DISTINCT FROM NEW.festival_id
      AND (event_id = NEW.item_id OR result_id = NEW.id)
      AND is_current = true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_generated_assets_visibility_from_result() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_sync_generated_assets_visibility ON public.results;
CREATE TRIGGER trigger_sync_generated_assets_visibility
AFTER UPDATE OF public_visible, published, result_status ON public.results
FOR EACH ROW
EXECUTE FUNCTION public.sync_generated_assets_visibility_from_result();

-- 4. Tenant-Isolated RLS Policies

-- poster_templates
DROP POLICY IF EXISTS "Admins can manage poster templates" ON public.poster_templates;
CREATE POLICY "Admins can manage poster templates"
  ON public.poster_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.is_superadmin = true
          OR (
            profiles.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
            AND profiles.tenant_id = poster_templates.tenant_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.is_superadmin = true
          OR (
            profiles.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
            AND profiles.tenant_id = poster_templates.tenant_id
          )
        )
    )
  );

-- poster_versions
DROP POLICY IF EXISTS "Admins can manage poster versions" ON public.poster_versions;
CREATE POLICY "Admins can manage poster versions"
  ON public.poster_versions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.poster_templates pt
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE pt.id = poster_versions.template_id
        AND (
          p.is_superadmin = true
          OR (
            p.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
            AND p.tenant_id = pt.tenant_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.poster_templates pt
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE pt.id = poster_versions.template_id
        AND (
          p.is_superadmin = true
          OR (
            p.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
            AND p.tenant_id = pt.tenant_id
          )
        )
    )
  );

-- poster_approval_requests
DROP POLICY IF EXISTS "Admins can manage approval requests" ON public.poster_approval_requests;
CREATE POLICY "Admins can manage approval requests"
  ON public.poster_approval_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.poster_templates pt
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE pt.id = poster_approval_requests.template_id
        AND (
          p.is_superadmin = true
          OR (
            p.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
            AND p.tenant_id = pt.tenant_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.poster_templates pt
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE pt.id = poster_approval_requests.template_id
        AND (
          p.is_superadmin = true
          OR (
            p.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
            AND p.tenant_id = pt.tenant_id
          )
        )
    )
  );

-- generated_assets (admin tenant-isolated)
DROP POLICY IF EXISTS "Admins can manage generated_assets" ON public.generated_assets;
CREATE POLICY "Admins can manage generated_assets"
  ON public.generated_assets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.is_superadmin = true
          OR (
            profiles.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
            AND profiles.tenant_id = generated_assets.tenant_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.is_superadmin = true
          OR (
            profiles.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
            AND profiles.tenant_id = generated_assets.tenant_id
          )
        )
    )
  );

-- generated_assets (public select only for current published assets & public results)
DROP POLICY IF EXISTS "Public can view generated_assets" ON public.generated_assets;
CREATE POLICY "Public can view generated_assets"
  ON public.generated_assets
  FOR SELECT
  TO anon, authenticated
  USING (
    is_current = true
    AND visibility_status = 'published'
    AND (
      (event_id IS NULL AND result_id IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.results r
        WHERE (r.item_id = generated_assets.event_id OR r.id = generated_assets.result_id)
          AND r.published IS TRUE
          AND COALESCE(r.result_status, 'draft') = 'published'
          AND r.public_visible IS TRUE
      )
    )
  );

-- export_jobs (admin tenant-isolated)
DROP POLICY IF EXISTS "Admins can manage export_jobs" ON public.export_jobs;
CREATE POLICY "Admins can manage export_jobs"
  ON public.export_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.is_superadmin = true
          OR (
            profiles.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
            AND profiles.tenant_id = export_jobs.tenant_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND (
          profiles.is_superadmin = true
          OR (
            profiles.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
            AND profiles.tenant_id = export_jobs.tenant_id
          )
        )
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
