BEGIN;

CREATE TABLE IF NOT EXISTS public.poster_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  scope_kind text NOT NULL CHECK (scope_kind IN ('item', 'result')),
  scope_id uuid NOT NULL,
  item_id uuid REFERENCES public.items(id) ON DELETE CASCADE,
  result_id uuid REFERENCES public.results(id) ON DELETE CASCADE,
  template_id uuid,
  design_snapshot jsonb NOT NULL CHECK (jsonb_typeof(design_snapshot) = 'object'),
  verified_outputs jsonb NOT NULL CHECK (jsonb_typeof(verified_outputs) = 'array'),
  render_hash text NOT NULL,
  visibility_status text NOT NULL CHECK (
    visibility_status IN ('draft', 'pending_approval', 'published', 'hidden', 'archived')
  ),
  is_current boolean NOT NULL DEFAULT true,
  superseded_by_generation_id uuid REFERENCES public.poster_generations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poster_generations_scope_identity_check CHECK (
    (scope_kind = 'item' AND item_id IS NOT NULL AND scope_id = item_id)
    OR (scope_kind = 'result' AND item_id IS NULL AND result_id IS NOT NULL AND scope_id = result_id)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_poster_generations_current_scope
  ON public.poster_generations (tenant_id, festival_id, scope_kind, scope_id)
  WHERE is_current IS TRUE;

CREATE INDEX IF NOT EXISTS idx_poster_generations_scope_history
  ON public.poster_generations (tenant_id, festival_id, scope_kind, scope_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poster_generations_created_by
  ON public.poster_generations (created_by, tenant_id, festival_id, created_at DESC);

ALTER TABLE public.generated_assets
  ADD COLUMN IF NOT EXISTS generation_id uuid
    REFERENCES public.poster_generations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_assets_generation_resolution
  ON public.generated_assets (generation_id, resolution)
  WHERE generation_id IS NOT NULL;

ALTER TABLE public.poster_generations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.poster_generations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.poster_generations TO service_role;

CREATE OR REPLACE FUNCTION public.guard_poster_generation_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.operation_id IS DISTINCT FROM OLD.operation_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.festival_id IS DISTINCT FROM OLD.festival_id
     OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
     OR NEW.scope_id IS DISTINCT FROM OLD.scope_id
     OR NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.result_id IS DISTINCT FROM OLD.result_id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.design_snapshot IS DISTINCT FROM OLD.design_snapshot
     OR NEW.verified_outputs IS DISTINCT FROM OLD.verified_outputs
     OR NEW.render_hash IS DISTINCT FROM OLD.render_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '23000', MESSAGE = 'Poster generation payload is immutable';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_poster_generation_immutable_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_poster_generation_immutable_fields ON public.poster_generations;
CREATE TRIGGER guard_poster_generation_immutable_fields
  BEFORE UPDATE ON public.poster_generations
  FOR EACH ROW EXECUTE FUNCTION public.guard_poster_generation_immutable_fields();

CREATE OR REPLACE FUNCTION public.lock_poster_generation_scope(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_scope_kind text,
  p_scope_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_item_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_festival_id IS NULL OR p_scope_kind IS NULL
     OR p_scope_kind NOT IN ('item', 'result') OR p_scope_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid poster generation lock scope';
  END IF;

  IF p_scope_kind = 'item' THEN
    v_item_id := p_scope_id;
  ELSE
    SELECT r.item_id INTO v_item_id
    FROM public.results r
    WHERE r.id = p_scope_id AND r.tenant_id = p_tenant_id AND r.festival_id = p_festival_id;
  END IF;

  IF v_item_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'item-result-visibility:' || p_tenant_id::text || ':' || p_festival_id::text || ':' || v_item_id::text,
      0
    ));
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('poster_generation_scope'),
    pg_catalog.hashtext(
      p_tenant_id::text || ':' || p_festival_id::text || ':' || p_scope_kind || ':' || p_scope_id::text
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.lock_poster_generation_scope(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalize_poster_generation(
  p_actor_id uuid,
  p_operation_id uuid,
  p_tenant_id uuid,
  p_festival_id uuid,
  p_item_id uuid,
  p_result_id uuid,
  p_template_id uuid,
  p_design_snapshot jsonb,
  p_verified_outputs jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_profile record;
  v_existing public.poster_generations%ROWTYPE;
  v_generation public.poster_generations%ROWTYPE;
  v_scope_kind text;
  v_scope_id uuid;
  v_result_item_id uuid;
  v_visibility boolean;
  v_output jsonb;
  v_resolution text;
  v_asset_id uuid;
  v_asset_ids jsonb;
  v_old_generation_ids uuid[];
BEGIN
  IF p_actor_id IS NULL OR p_operation_id IS NULL OR p_tenant_id IS NULL OR p_festival_id IS NULL
     OR p_design_snapshot IS NULL OR jsonb_typeof(p_design_snapshot) <> 'object'
     OR p_verified_outputs IS NULL OR jsonb_typeof(p_verified_outputs) <> 'array'
     OR jsonb_array_length(p_verified_outputs) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid poster generation request';
  END IF;

  SELECT p.id, p.tenant_id, p.role, p.is_superadmin
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = p_actor_id;

  IF NOT FOUND
     OR (v_profile.is_superadmin IS NOT TRUE AND (
       v_profile.tenant_id IS DISTINCT FROM p_tenant_id
       OR COALESCE(v_profile.role, '') NOT IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader')
     ))
     OR NOT EXISTS (
       SELECT 1 FROM public.tenants t
       WHERE t.id = p_tenant_id AND t.access_disabled IS FALSE
     )
     OR public.tenant_module_enabled(p_tenant_id, 'poster_studio') IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Poster Studio access denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.festival_calendar f
    WHERE f.id = p_festival_id AND f.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Festival is outside the authorized tenant scope';
  END IF;

  IF p_item_id IS NOT NULL THEN
    v_scope_kind := 'item';
    v_scope_id := p_item_id;
    IF NOT EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id = p_item_id AND i.tenant_id = p_tenant_id AND i.festival_id = p_festival_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Item is outside the authorized festival scope';
    END IF;
  ELSIF p_result_id IS NOT NULL THEN
    v_scope_kind := 'result';
    v_scope_id := p_result_id;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An item or result scope is required';
  END IF;

  IF p_result_id IS NOT NULL THEN
    SELECT r.item_id INTO v_result_item_id
    FROM public.results r
    WHERE r.id = p_result_id
      AND r.tenant_id = p_tenant_id
      AND r.festival_id = p_festival_id;

    IF NOT FOUND OR (p_item_id IS NOT NULL AND v_result_item_id IS DISTINCT FROM p_item_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Result is outside the authorized item and festival scope';
    END IF;

    IF p_item_id IS NULL AND v_result_item_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id = v_result_item_id AND i.tenant_id = p_tenant_id AND i.festival_id = p_festival_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Result item is outside the authorized festival scope';
    END IF;
  END IF;

  IF p_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.poster_templates t
    WHERE t.id = p_template_id AND t.tenant_id = p_tenant_id AND t.festival_id = p_festival_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Template is outside the authorized festival scope';
  END IF;

  IF p_design_snapshot->>'userId' IS DISTINCT FROM p_actor_id::text
     OR p_design_snapshot->>'tenantId' IS DISTINCT FROM p_tenant_id::text
     OR p_design_snapshot->>'festivalId' IS DISTINCT FROM p_festival_id::text
     OR p_design_snapshot->>'itemId' IS DISTINCT FROM p_item_id::text
     OR p_design_snapshot->>'resultId' IS DISTINCT FROM p_result_id::text
     OR (p_template_id IS NOT NULL AND p_design_snapshot->>'templateId' IS DISTINCT FROM p_template_id::text)
     OR COALESCE((p_design_snapshot->>'snapshotVersion')::integer, 0) <> 1
     OR COALESCE((p_design_snapshot->>'width')::numeric, 0) <= 0
     OR COALESCE((p_design_snapshot->>'height')::numeric, 0) <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Poster snapshot scope or dimensions do not match the request';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_verified_outputs) AS outputs(output_row)
    WHERE COALESCE(output_row->>'storageKey', '') = ''
       OR COALESCE(output_row->>'contentType', '') NOT IN ('image/jpeg', 'image/png', 'image/webp')
       OR COALESCE((output_row->>'byteSize')::bigint, 0) <= 0
       OR COALESCE((output_row->>'width')::integer, 0) <= 0
       OR COALESCE((output_row->>'height')::integer, 0) <= 0
       OR COALESCE(output_row->>'etag', '') = ''
       OR jsonb_typeof(output_row->'resolutions') IS DISTINCT FROM 'array'
       OR CASE WHEN jsonb_typeof(output_row->'resolutions') = 'array'
          THEN jsonb_array_length(output_row->'resolutions') = 0 ELSE true END
       OR output_row->>'storageKey' NOT LIKE
          ('festivals/' || p_festival_id::text || '/posters/' || p_operation_id::text || '/%')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Verified poster output metadata is invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_verified_outputs) AS outputs(output_row)
    CROSS JOIN LATERAL jsonb_array_elements_text(output_row->'resolutions') AS resolutions(value)
    WHERE resolutions.value NOT IN ('thumb', 'share', 'standard', 'hd', 'print')
  ) OR EXISTS (
    SELECT resolutions.value
    FROM jsonb_array_elements(p_verified_outputs) AS outputs(output_row)
    CROSS JOIN LATERAL jsonb_array_elements_text(output_row->'resolutions') AS resolutions(value)
    GROUP BY resolutions.value
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Poster resolutions are invalid or duplicated';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('poster_generation_operation'),
    pg_catalog.hashtext(p_operation_id::text)
  );

  SELECT * INTO v_existing
  FROM public.poster_generations g
  WHERE g.operation_id = p_operation_id;

  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM p_actor_id
       OR v_existing.tenant_id IS DISTINCT FROM p_tenant_id
       OR v_existing.festival_id IS DISTINCT FROM p_festival_id
       OR v_existing.item_id IS DISTINCT FROM p_item_id
       OR v_existing.result_id IS DISTINCT FROM p_result_id
       OR v_existing.template_id IS DISTINCT FROM p_template_id
       OR v_existing.design_snapshot IS DISTINCT FROM p_design_snapshot
       OR v_existing.verified_outputs IS DISTINCT FROM p_verified_outputs THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'poster_generation_operation_conflict';
    END IF;

    SELECT COALESCE(jsonb_agg(a.id ORDER BY a.resolution), '[]'::jsonb)
    INTO v_asset_ids
    FROM public.generated_assets a
    WHERE a.generation_id = v_existing.id;

    IF jsonb_array_length(v_asset_ids) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'XX000', MESSAGE = 'Poster generation metadata is incomplete';
    END IF;

    RETURN jsonb_build_object(
      'generationId', v_existing.id,
      'operationId', v_existing.operation_id,
      'assetIds', v_asset_ids,
      'renderHash', v_existing.render_hash,
      'visibilityStatus', v_existing.visibility_status,
      'isCurrent', v_existing.is_current
    );
  END IF;

  PERFORM public.lock_poster_generation_scope(p_tenant_id, p_festival_id, v_scope_kind, v_scope_id);

  SELECT COALESCE(array_agg(g.id), ARRAY[]::uuid[])
  INTO v_old_generation_ids
  FROM public.poster_generations g
  WHERE g.tenant_id = p_tenant_id AND g.festival_id = p_festival_id
    AND g.scope_kind = v_scope_kind AND g.scope_id = v_scope_id AND g.is_current IS TRUE;

  UPDATE public.poster_generations g
  SET is_current = false, updated_at = now()
  WHERE g.id = ANY(v_old_generation_ids);

  IF v_scope_kind = 'item' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.tenant_id = p_tenant_id AND r.festival_id = p_festival_id AND r.item_id = p_item_id
        AND r.published IS TRUE AND COALESCE(r.result_status, 'draft') = 'published' AND r.public_visible IS TRUE
    ) INTO v_visibility;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.id = p_result_id AND r.tenant_id = p_tenant_id AND r.festival_id = p_festival_id
        AND r.published IS TRUE AND COALESCE(r.result_status, 'draft') = 'published' AND r.public_visible IS TRUE
    ) INTO v_visibility;
  END IF;

  INSERT INTO public.poster_generations (
    operation_id, created_by, tenant_id, festival_id, scope_kind, scope_id, item_id, result_id,
    template_id, design_snapshot, verified_outputs, render_hash, visibility_status, is_current
  ) VALUES (
    p_operation_id, p_actor_id, p_tenant_id, p_festival_id, v_scope_kind, v_scope_id, p_item_id, p_result_id,
    p_template_id, p_design_snapshot, p_verified_outputs, 'poster_' || p_operation_id::text,
    CASE WHEN v_visibility THEN 'published' ELSE 'draft' END, true
  ) RETURNING * INTO v_generation;

  FOR v_output IN SELECT value FROM jsonb_array_elements(p_verified_outputs)
  LOOP
    FOR v_resolution IN
      SELECT value FROM jsonb_array_elements_text(v_output->'resolutions') AS resolutions(value)
    LOOP
      INSERT INTO public.generated_assets (
        tenant_id, festival_id, event_id, result_id, asset_type, template_id, render_hash,
        resolution, storage_path, public_url, created_by, event_name, visibility_status,
        is_current, source_fingerprint, generation_id, created_at, updated_at
      ) VALUES (
        p_tenant_id, p_festival_id, p_item_id, p_result_id, 'poster', p_template_id::text,
        v_generation.render_hash, v_resolution::public.export_resolution_enum,
        v_output->>'storageKey', 'r2://' || (v_output->>'storageKey'), p_actor_id,
        p_design_snapshot->'variables'->>'event_name', v_generation.visibility_status,
        true, p_design_snapshot->>'sourceResultFingerprint', v_generation.id, now(), now()
      ) RETURNING id INTO v_asset_id;
    END LOOP;
  END LOOP;

  UPDATE public.poster_generations old_generation
  SET superseded_by_generation_id = v_generation.id, updated_at = now()
  WHERE old_generation.id = ANY(v_old_generation_ids);

  UPDATE public.generated_assets old_asset
  SET is_current = false,
      superseded_by = (
        SELECT replacement.id
        FROM public.generated_assets replacement
        WHERE replacement.generation_id = v_generation.id
        ORDER BY (replacement.resolution = old_asset.resolution) DESC, replacement.created_at, replacement.id
        LIMIT 1
      ),
      updated_at = now()
  WHERE old_asset.tenant_id = p_tenant_id
    AND old_asset.festival_id = p_festival_id
    AND old_asset.asset_type = 'poster'::public.asset_type_enum
    AND old_asset.is_current IS TRUE
    AND old_asset.generation_id IS DISTINCT FROM v_generation.id
    AND ((p_item_id IS NOT NULL AND old_asset.event_id = p_item_id)
      OR (p_item_id IS NULL AND old_asset.event_id IS NULL AND old_asset.result_id = p_result_id));

  SELECT COALESCE(jsonb_agg(a.id ORDER BY a.resolution), '[]'::jsonb)
  INTO v_asset_ids
  FROM public.generated_assets a
  WHERE a.generation_id = v_generation.id;

  RETURN jsonb_build_object(
    'generationId', v_generation.id,
    'operationId', v_generation.operation_id,
    'assetIds', v_asset_ids,
    'renderHash', v_generation.render_hash,
    'visibilityStatus', v_generation.visibility_status,
    'isCurrent', v_generation.is_current
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_poster_generation(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_poster_generation(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_generated_assets_visibility_from_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_item_is_public boolean := false;
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    IF NEW.tenant_id IS NOT NULL AND NEW.festival_id IS NOT NULL THEN
      PERFORM public.lock_poster_generation_scope(NEW.tenant_id, NEW.festival_id, 'item', NEW.item_id);
    END IF;
  END IF;
  IF NEW.tenant_id IS NOT NULL AND NEW.festival_id IS NOT NULL THEN
    PERFORM public.lock_poster_generation_scope(NEW.tenant_id, NEW.festival_id, 'result', NEW.id);
  END IF;

  IF NEW.item_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
        AND r.festival_id IS NOT DISTINCT FROM NEW.festival_id
        AND r.item_id = NEW.item_id
        AND r.published IS TRUE
        AND COALESCE(r.result_status, 'draft') = 'published'
        AND r.public_visible IS TRUE
    ) INTO v_item_is_public;
  ELSE
    v_item_is_public := NEW.published IS TRUE
      AND COALESCE(NEW.result_status, 'draft') = 'published'
      AND NEW.public_visible IS TRUE;
  END IF;

  UPDATE public.generated_assets
  SET visibility_status = CASE WHEN v_item_is_public THEN 'published' ELSE 'draft' END,
      updated_at = now()
  WHERE festival_id IS NOT DISTINCT FROM NEW.festival_id
    AND ((NEW.item_id IS NOT NULL AND event_id = NEW.item_id) OR result_id = NEW.id)
    AND is_current IS TRUE;

  UPDATE public.poster_generations
  SET visibility_status = CASE WHEN v_item_is_public THEN 'published' ELSE 'draft' END,
      updated_at = now()
  WHERE festival_id IS NOT DISTINCT FROM NEW.festival_id
    AND ((NEW.item_id IS NOT NULL AND item_id = NEW.item_id) OR result_id = NEW.id)
    AND is_current IS TRUE;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_generated_assets_visibility_from_result() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
