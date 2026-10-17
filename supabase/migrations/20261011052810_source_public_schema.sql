


-- Snapshot of the live source public schema on 2026-10-11.
-- Schema only: no existing rows, Auth users, or Storage objects are copied.
-- Enable source-specific extensions before restoring dependent functions.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."asset_type_enum" AS ENUM (
    'poster',
    'certificate',
    'leaderboard'
);


ALTER TYPE "public"."asset_type_enum" OWNER TO "postgres";


CREATE TYPE "public"."export_resolution_enum" AS ENUM (
    'thumb',
    'share',
    'standard',
    'hd',
    'print'
);


ALTER TYPE "public"."export_resolution_enum" OWNER TO "postgres";


CREATE TYPE "public"."export_status_enum" AS ENUM (
    'queued',
    'processing',
    'completed',
    'failed'
);


ALTER TYPE "public"."export_status_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_assert_import_access"("p_target_tenant_id" "uuid", "p_target_festival_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid;
  v_is_admin boolean;
BEGIN
  -- Authenticated caller required
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Festival must be supplied (NULL rejected)
  IF p_target_festival_id IS NULL THEN
    RAISE EXCEPTION 'Festival is required';
  END IF;

  -- Admin gate: deny normal authenticated non-admin users
  SELECT COALESCE(p.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader', 'superadmin'), false)
          OR COALESCE(p.is_superadmin, false)
    INTO v_is_admin
    FROM public.profiles p
   WHERE p.id = v_uid;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  -- Tenant access: caller's own tenant, an authorised descendant org's tenant,
  -- or (explicitly) superadmin cross-tenant.
  -- get_visible_organisations walks DOWN the caller's hierarchy only.
  IF NOT (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1
        FROM public.get_visible_organisations(public.get_my_tenant_id()) vo
       WHERE vo.tenant_id = p_target_tenant_id
          OR vo.id = (SELECT organisation_id FROM public.tenants WHERE id = p_target_tenant_id)
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied: target tenant is not within your hierarchy';
  END IF;

  -- Festival must belong to the target tenant (enforced for superadmin too)
  IF NOT EXISTS (
    SELECT 1
      FROM public.festival_calendar fc
     WHERE fc.id = p_target_festival_id
       AND fc.tenant_id = p_target_tenant_id
  ) THEN
    RAISE EXCEPTION 'Festival does not belong to the target tenant';
  END IF;
END;
$$;


ALTER FUNCTION "public"."_assert_import_access"("p_target_tenant_id" "uuid", "p_target_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_assert_organisation_hierarchy_access"("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organisations WHERE id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Organisation not found';
  END IF;

  IF public.is_superadmin() THEN
    RETURN;
  END IF;

  -- Normal authenticated members (judge/volunteer/participant) are denied.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid
      AND COALESCE(
        p.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader', 'superadmin'),
        false
      )
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  -- Caller must be a tenant admin with an enabled tenant. Since the corrected
  -- get_my_tenant_id() (section 3B) returns NULL for a disabled tenant, this
  -- branch denies disabled admins before the explicit check below can run.
  IF public.get_my_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'Permission denied: tenant access required';
  END IF;

  -- Defensive second layer: only reachable if get_my_tenant_id() semantics are
  -- ever changed to return an id for a disabled tenant.
  IF EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = public.get_my_tenant_id()
      AND t.access_disabled = true
  ) THEN
    RAISE EXCEPTION 'Permission denied: tenant access is disabled';
  END IF;

  IF public.get_my_org_id() IS NULL THEN
    RAISE EXCEPTION 'Permission denied: organisation hierarchy access required';
  END IF;

  -- Target must be within the caller's descendant tree, and never the caller's
  -- own organisation. Siblings, parents, and unrelated orgs are rejected.
  IF NOT (
    public.is_org_visible(p_org_id)
    AND p_org_id <> public.get_my_org_id()
  ) THEN
    RAISE EXCEPTION 'Permission denied: target organisation is not within your hierarchy';
  END IF;
END;
$$;


ALTER FUNCTION "public"."_assert_organisation_hierarchy_access"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_assert_superadmin_access"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Permission denied: superadmin access required';
  END IF;
END;
$$;


ALTER FUNCTION "public"."_assert_superadmin_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_create_default_tenant_agent_prompt"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_festival_id uuid;
  v_prompt text;
BEGIN
  SELECT f.id INTO v_festival_id
  FROM public.festival_calendar f
  WHERE f.tenant_id = NEW.id AND COALESCE(f.is_active, false) = true
  ORDER BY f.id DESC
  LIMIT 1;

  v_prompt := public._tenant_leaderboard_agent_prompt_v2(NEW.id, v_festival_id, NEW.name);

  INSERT INTO public.tenant_agent_prompts (
    tenant_id, festival_id, prompt_type, prompt_version, prompt_text,
    contract_manifest, generated_by
  ) VALUES (
    NEW.id, v_festival_id, 'leaderboard_ui', 2, v_prompt,
    jsonb_build_object(
      'tenant_id', NEW.id, 'festival_id', v_festival_id,
      'scope', 'tenant_festival', 'mode', 'public_read_only',
      'ui_customization', true, 'backend_customization', false,
      'default_renderer_fallback', true, 'realtime', true,
      'secrets_included', false, 'contract_version', 2
    ), NULL
  )
  ON CONFLICT (tenant_id, prompt_type) WHERE is_active = true DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_create_default_tenant_agent_prompt"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_provisioning_get_op"("p_operation_type" "text", "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_op jsonb;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object(
    'id', o.id,
    'status', o.status,
    'target_tenant_id', o.target_tenant_id,
    'target_organisation_id', o.target_organisation_id,
    'target_user_id', o.target_user_id,
    'admin_email', o.admin_email
  ) INTO v_op
  FROM public.tenant_provisioning_operations o
  WHERE o.operation_type = p_operation_type
    AND o.idempotency_key = p_idempotency_key;
  RETURN v_op;
END;
$$;


ALTER FUNCTION "public"."_provisioning_get_op"("p_operation_type" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_provisioning_get_org"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org jsonb;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation is required';
  END IF;
  SELECT jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'org_type', o.org_type,
    'tenant_id', o.tenant_id,
    'archived_at', o.archived_at,
    'parent_id', o.parent_id
  ) INTO v_org
  FROM public.organisations o
  WHERE o.id = p_org_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organisation not found';
  END IF;
  RETURN v_org;
END;
$$;


ALTER FUNCTION "public"."_provisioning_get_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_provisioning_link_profile"("p_user_id" "uuid", "p_tenant_id" "uuid", "p_full_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_existing_tenant uuid;
  v_is_superadmin boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Target auth user does not exist';
  END IF;

  SELECT tenant_id, COALESCE(is_superadmin, false)
    INTO v_existing_tenant, v_is_superadmin
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_is_superadmin THEN
    RAISE EXCEPTION 'Provisioning a superadmin account is not allowed';
  END IF;

  IF v_existing_tenant IS NOT NULL AND v_existing_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'Target user already belongs to another tenant';
  END IF;

  INSERT INTO public.profiles (id, full_name, role, tenant_id, is_superadmin)
  VALUES (p_user_id, p_full_name, 'admin', p_tenant_id, false)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role = 'admin',
        tenant_id = EXCLUDED.tenant_id
    WHERE public.profiles.tenant_id IS NULL;
END;
$$;


ALTER FUNCTION "public"."_provisioning_link_profile"("p_user_id" "uuid", "p_tenant_id" "uuid", "p_full_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_provisioning_upsert_op"("p_operation_type" "text", "p_idempotency_key" "text", "p_status" "text", "p_requested_by" "uuid" DEFAULT NULL::"uuid", "p_target_organisation_id" "uuid" DEFAULT NULL::"uuid", "p_target_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_target_user_id" "uuid" DEFAULT NULL::"uuid", "p_admin_email" "text" DEFAULT NULL::"text", "p_failure_code" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_op_id uuid;
BEGIN
  INSERT INTO public.tenant_provisioning_operations (
    operation_type, idempotency_key, status, requested_by,
    target_organisation_id, target_tenant_id, target_user_id,
    admin_email, failure_code, completed_at
  ) VALUES (
    p_operation_type, p_idempotency_key, p_status,
    COALESCE(p_requested_by, auth.uid()),
    p_target_organisation_id, p_target_tenant_id, p_target_user_id,
    p_admin_email, p_failure_code,
    CASE WHEN p_status = 'completed' THEN now() ELSE NULL END
  )
  ON CONFLICT (operation_type, idempotency_key) DO UPDATE
    SET status = EXCLUDED.status,
        requested_by = COALESCE(public.tenant_provisioning_operations.requested_by, EXCLUDED.requested_by),
        target_organisation_id = COALESCE(EXCLUDED.target_organisation_id, public.tenant_provisioning_operations.target_organisation_id),
        target_tenant_id = COALESCE(EXCLUDED.target_tenant_id, public.tenant_provisioning_operations.target_tenant_id),
        target_user_id = COALESCE(EXCLUDED.target_user_id, public.tenant_provisioning_operations.target_user_id),
        admin_email = COALESCE(EXCLUDED.admin_email, public.tenant_provisioning_operations.admin_email),
        failure_code = EXCLUDED.failure_code,
        completed_at = CASE WHEN EXCLUDED.status = 'completed' THEN now() ELSE public.tenant_provisioning_operations.completed_at END,
        updated_at = now()
  RETURNING id INTO v_op_id;

  IF v_op_id IS NULL THEN
    SELECT id INTO v_op_id
    FROM public.tenant_provisioning_operations
    WHERE operation_type = p_operation_type
      AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_op_id;
END;
$$;


ALTER FUNCTION "public"."_provisioning_upsert_op"("p_operation_type" "text", "p_idempotency_key" "text", "p_status" "text", "p_requested_by" "uuid", "p_target_organisation_id" "uuid", "p_target_tenant_id" "uuid", "p_target_user_id" "uuid", "p_admin_email" "text", "p_failure_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_revoke_tenant_leaderboard_prompt"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.access_disabled IS DISTINCT FROM OLD.access_disabled THEN
    UPDATE public.tenant_agent_prompts
    SET is_active = NOT COALESCE(NEW.access_disabled, false),
        revoked_at = CASE WHEN COALESCE(NEW.access_disabled, false) THEN now() ELSE NULL END,
        updated_at = now()
    WHERE tenant_id = NEW.id AND prompt_type = 'leaderboard_ui';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_revoke_tenant_leaderboard_prompt"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_sync_prompt_after_festival_context_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public._sync_tenant_leaderboard_agent_prompt_context(NEW.tenant_id);
  IF TG_OP = 'UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     AND OLD.tenant_id IS NOT NULL THEN
    PERFORM public._sync_tenant_leaderboard_agent_prompt_context(OLD.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_sync_prompt_after_festival_context_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_sync_prompt_after_tenant_name_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public._sync_tenant_leaderboard_agent_prompt_context(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_sync_prompt_after_tenant_name_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_sync_tenant_leaderboard_agent_prompt_context"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_name text;
  v_festival_id uuid;
BEGIN
  SELECT t.name INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  SELECT f.id INTO v_festival_id
  FROM public.festival_calendar f
  WHERE f.tenant_id = p_tenant_id
    AND COALESCE(f.is_active, false) = true
  ORDER BY f.id DESC
  LIMIT 1;

  UPDATE public.tenant_agent_prompts p
  SET festival_id = v_festival_id,
      prompt_version = 2,
      prompt_text = public._tenant_leaderboard_agent_prompt_v2(
        p.tenant_id, v_festival_id, v_tenant_name
      ),
      contract_manifest = p.contract_manifest || jsonb_build_object(
        'tenant_id', p.tenant_id,
        'festival_id', v_festival_id,
        'context_synced_at', now(),
        'contract_version', 2
      ),
      updated_at = now()
  WHERE p.tenant_id = p_tenant_id
    AND p.prompt_type = 'leaderboard_ui';
END;
$$;


ALTER FUNCTION "public"."_sync_tenant_leaderboard_agent_prompt_context"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_tenant_leaderboard_agent_prompt"("p_tenant_id" "uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid", "p_tenant_name" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  RETURN format($prompt$
You are implementing the public Leaderboard UI for the following tenant.

TENANT CONTEXT
- Tenant ID: %s
- Tenant name: %s
- Festival ID: %s
- Festival rule: resolve the active festival belonging to TENANT_ID when FESTIVAL_ID is null.
- Prompt version: 1

PRODUCT GOAL
Build a professional, responsive public leaderboard experience. You may redesign
the visual presentation completely: layout, cards, colors, typography, spacing,
responsive behavior, podiums, tables, charts and animations.

PARALLEL RENDERING RULE
- The existing/default Leaderboard renderer is the safe baseline and must keep
  working unchanged for every tenant.
- A custom renderer is an optional parallel layer for this tenant only.
- Never replace or remove the default renderer. If custom rendering fails, is
  disabled, or has incomplete data, fall back to the default renderer.
- Do not change public routes or existing admin/judge/team workflows.

APPROVED READ-ONLY DATA CONTRACT
- Public leaderboard: get_public_leaderboard_scoped(tenant_id, festival_id)
- Public published results: get_public_published_results_scoped(tenant_id, festival_id)
- Public settings: get_public_leaderboard_settings(tenant_id, festival_id)
- Public schedule: approved tenant/festival-scoped public schedule source
- Public chatbot: use the application server proxy only; never call a provider secret directly.

REQUIRED SAFE CONTRACT KEYS
- TENANT_ID: the exact tenant UUID above
- FESTIVAL_ID: the exact festival UUID above, or the approved active-festival resolver
- LEADERBOARD_RPC: get_public_leaderboard_scoped
- PUBLISHED_RESULTS_RPC: get_public_published_results_scoped
- LEADERBOARD_SETTINGS_RPC: get_public_leaderboard_settings
- SCHEDULE_SOURCE: approved tenant/festival-scoped public schedule source
- REALTIME_SCOPE: tenant_id + festival_id only
- SUPABASE_URL: read from the host application's environment
- SUPABASE_PUBLISHABLE_KEY: read from the host application's environment
- CHATBOT_PROXY: application server proxy only
- CUSTOM_RENDERER_ENABLED: tenant configuration flag; default renderer remains fallback

DATA RULES
- Every request must carry both TENANT_ID and FESTIVAL_ID, or use the approved
  active-festival resolver for this tenant.
- Show only public/published records.
- Never read, cache, infer or display another tenant's data.
- Preserve organisation/team, item, category, ranking, points and schedule scope.
- Realtime subscriptions must be tenant/festival scoped, never global.

IMMUTABLE BACKEND RULES
- Do not change database tables, migrations, RPC names, RLS policies, auth rules,
  result publication rules, marks, historical results or existing portal workflows.
- Do not create a second assignment, results or leaderboard data model.
- Do not add write operations to a public leaderboard.
- Do not use service-role keys, database passwords, JWT secrets or AI provider secrets.
- Resolve public environment values from the host application's environment only.

REALTIME BEHAVIOUR
Subscribe only through the host application's approved realtime layer. On a
tenant/festival-scoped published result, schedule, settings or access change,
invalidate the related read-only query and update the UI without a full reload.
When tenant access is revoked, stop subscriptions and show the revoked state.

ACCEPTANCE CHECKLIST
- Desktop, tablet and mobile layouts are usable.
- Empty, loading, stale, revoked and error states are visible.
- Published results never expose private marks or unpublished rows.
- Existing admin, judge, participant, schedule and team workflows are unchanged.
- Verify tenant isolation with at least two tenants before delivery.
$prompt$, p_tenant_id::text, COALESCE(p_tenant_name, 'Resolve from tenant context'),
    COALESCE(p_festival_id::text, 'Resolve active festival'));
END;
$_$;


ALTER FUNCTION "public"."_tenant_leaderboard_agent_prompt"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_tenant_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_tenant_leaderboard_agent_prompt_v2"("p_tenant_id" "uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid", "p_tenant_name" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  RETURN public._tenant_leaderboard_agent_prompt(p_tenant_id, p_festival_id, p_tenant_name)
    || format($detail$

IMPLEMENTATION CONTRACT
- Work only inside the existing public Leaderboard feature boundary.
- Reuse the repository's existing React Native/Expo Router components, hooks,
  query client and Supabase client. Do not introduce a second data layer.
- Keep the current default renderer mounted and working. Add custom rendering as
  a tenant-scoped, feature-flagged adapter with an error boundary and fallback.
- Do not change the public URL shape: /leaderboard?tenant_id=TENANT_ID.

SAFE TENANT CONFIGURATION KEYS
- TENANT_ID = %s
- TENANT_NAME = %s
- FESTIVAL_ID = %s
- ACTIVE_FESTIVAL_RESOLVER = tenant_id + is_active festival only
- CUSTOM_RENDERER_ENABLED = false by default unless approved by the host app
- LEADERBOARD_MODE = public_read_only
- RESULT_VISIBILITY = published_only
- REALTIME_CHANNEL_SCOPE = TENANT_ID + FESTIVAL_ID

APPROVED DATA KEYS
- LEADERBOARD_RPC = get_public_leaderboard_scoped(p_tenant_id, p_festival_id)
- PUBLISHED_RESULTS_RPC = get_public_published_results_scoped(p_tenant_id, p_festival_id)
- SETTINGS_RPC = get_public_leaderboard_settings(p_tenant_id, p_festival_id)
- SCHEDULE_SOURCE = the existing tenant/festival-scoped public schedule query
- RESULT_FIELDS = item, category, organisation, participant-safe display fields,
  rank, points, grade, published_at and public visibility fields only
- SCHEDULE_FIELDS = item, category, date, start/end time, venue and public status
- SETTINGS_FIELDS = public festival name, branding/theme values and visibility flags
- REALTIME_TABLES = results, schedules, festival_leaderboard_settings,
  festival_calendar (through the host realtime layer only)

ENVIRONMENT KEY POLICY
- SUPABASE_URL = read from the host app environment
- SUPABASE_PUBLISHABLE_KEY = read from the host app environment
- CHATBOT_PROXY = existing application server proxy only
- Never place actual values for any environment key in source code or this prompt.
- Never request or use service-role keys, database passwords, JWT signing secrets,
  private auth tokens, payment secrets or AI provider secrets.

DATA AND SECURITY IMPLEMENTATION
- Every query, cache key, prefetch and realtime channel must include TENANT_ID.
- Every festival query must include FESTIVAL_ID or the approved active resolver.
- Reject missing, malformed or mismatched tenant/festival context before rendering.
- Do not trust a tenant_id supplied by UI alone; the approved RPC/RLS contract is
  authoritative.
- Do not display unpublished results, judge marks, private participant fields,
  admin credentials, internal audit data or another tenant's records.
- Do not write from the public leaderboard. All mutations remain in existing admin
  workflows and existing services.
- Stop subscriptions and clear tenant-scoped cache when access is revoked.

REALTIME IMPLEMENTATION
- Subscribe through the existing Supabase realtime client only.
- Use a unique channel per TENANT_ID and FESTIVAL_ID.
- On an approved change, invalidate only the matching leaderboard, result,
  settings and schedule query keys; do not globally invalidate other tenants.
- Handle SUBSCRIBED, CLOSED, CHANNEL_ERROR and TIMEOUT states.
- Reconnect safely with bounded retry/backoff and no duplicate channels.
- Re-fetch through approved read-only RPCs after an event; never trust payloads
  as authorization.

UI REQUIREMENTS
- Preserve the current default layout as a complete fallback.
- Custom layout must work on mobile, tablet and desktop.
- Include loading, empty, error, stale, offline, revoked and no-active-festival states.
- Make tenant name, festival name, last updated time and publication state clear.
- Keep keyboard navigation, readable contrast, reduced-motion support and screen
  reader labels.
- Do not hide an error behind a blank screen.

DELIVERY REQUIREMENTS
- First inspect the existing leaderboard implementation and reuse its contracts.
- Before editing, list the exact files to change and why.
- Do not create migrations, RPCs, tables or policies.
- Do not modify admin, judge, participant, team leader, schedule or result workflows.
- Run lint and the existing web build after implementation.
- Test at least two tenant IDs and a mismatched festival ID.
- Test default mode, custom mode, feature-flag off, realtime update, revoked tenant,
  empty data and RPC failure.
- Report changed files, tests, fallback behavior and any unresolved issue.
$detail$, p_tenant_id::text, COALESCE(p_tenant_name, 'Resolve from tenant context'),
    COALESCE(p_festival_id::text, 'Resolve active festival'));
END;
$_$;


ALTER FUNCTION "public"."_tenant_leaderboard_agent_prompt_v2"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_tenant_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_mark"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_registration_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_max_mark" numeric, "p_criteria_snapshot" "jsonb", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_result JSONB;
BEGIN
  -- 1. Strict Admin Check (Bypasses Judge Token entirely)
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only administrators can use the manual mark re-entry portal.';
  END IF;

  -- 2. Upsert the mark entry
  -- We assume marks are already unlocked by unlock_schedule_marks(), but admins can override anyway.
  WITH saved_mark AS (
    INSERT INTO public.mark_entries (
      schedule_id,
      judge_id,
      registration_id,
      criteria_scores,
      total_mark,
      entry_mode_snapshot,
      max_mark_snapshot,
      criteria_snapshot,
      is_draft,
      is_final,
      submitted_at,
      updated_at
    ) VALUES (
      p_schedule_id,
      p_judge_id,
      p_registration_id,
      COALESCE(p_criteria_scores, '{}'::jsonb),
      p_total_mark,
      'criteria', -- Always assuming criteria mode for this UI, or adapt if needed
      COALESCE(p_max_mark, 100),
      COALESCE(p_criteria_snapshot, '[]'::jsonb),
      (p_status = 'draft'),
      (p_status = 'final'),
      CASE WHEN p_status = 'final' THEN now() ELSE NULL END,
      now()
    )
    ON CONFLICT (schedule_id, judge_id, registration_id)
    DO UPDATE SET
      criteria_scores = EXCLUDED.criteria_scores,
      total_mark = EXCLUDED.total_mark,
      entry_mode_snapshot = EXCLUDED.entry_mode_snapshot,
      max_mark_snapshot = EXCLUDED.max_mark_snapshot,
      criteria_snapshot = EXCLUDED.criteria_snapshot,
      is_draft = EXCLUDED.is_draft,
      is_final = EXCLUDED.is_final,
      submitted_at = COALESCE(public.mark_entries.submitted_at, EXCLUDED.submitted_at),
      updated_at = EXCLUDED.updated_at
    RETURNING *
  )
  SELECT jsonb_build_object(
    'id', m.id,
    'schedule_id', m.schedule_id,
    'judge_id', m.judge_id,
    'registration_id', m.registration_id,
    'is_draft', m.is_draft,
    'is_final', m.is_final,
    'total_mark', m.total_mark,
    'updated_at', m.updated_at
  ) INTO v_result
  FROM saved_mark m;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."admin_upsert_mark"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_registration_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_max_mark" numeric, "p_criteria_snapshot" "jsonb", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_stage_code_letters"("p_schedule_id" "uuid", "p_item_id" "uuid", "p_tenant_id" "uuid", "p_assignments" "jsonb", "p_overwrite" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_is_locked boolean;
  v_assignment jsonb;
  v_assigned_count integer := 0;
BEGIN
  -- Lock the schedule row to prevent concurrent generations
  SELECT is_shuffle_locked INTO v_is_locked 
  FROM public.schedules 
  WHERE id = p_schedule_id AND tenant_id = p_tenant_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule not found or tenant mismatch';
  END IF;

  IF v_is_locked THEN
    RAISE EXCEPTION 'Shuffle is locked';
  END IF;

  IF p_overwrite THEN
    -- Clear existing letters if overwriting — scoped to tenant via item
    UPDATE public.registrations 
    SET code_letter = NULL 
    WHERE item_id = p_item_id 
      AND tenant_id = p_tenant_id
      AND is_verified = true 
      AND status != 'rejected';
  END IF;

  -- Process assignments array
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    UPDATE public.registrations 
    SET code_letter = v_assignment->>'code_letter'
    WHERE id = (v_assignment->>'registration_id')::uuid
      AND tenant_id = p_tenant_id
      AND is_verified = true
      AND status != 'rejected';
      
    IF FOUND THEN
      v_assigned_count := v_assigned_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'assigned_count', v_assigned_count
  );
END;
$$;


ALTER FUNCTION "public"."apply_stage_code_letters"("p_schedule_id" "uuid", "p_item_id" "uuid", "p_tenant_id" "uuid", "p_assignments" "jsonb", "p_overwrite" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_judge_login"("p_token_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
BEGIN
  SELECT jt.*
  INTO v_token
  FROM public.judge_tokens jt
  WHERE jt.id = p_token_id
  FOR UPDATE;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Login request not found.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_token.tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to approve this request.';
  END IF;

  IF v_token.status <> 'pending_approval'
    OR v_token.is_used
    OR v_token.is_revoked IS TRUE THEN
    RAISE EXCEPTION 'This login request is no longer pending.';
  END IF;

  UPDATE public.judge_tokens
  SET status = 'approved'
  WHERE id = p_token_id;
END;
$$;


ALTER FUNCTION "public"."approve_judge_login"("p_token_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_child_organisation"("p_org_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_was_archived boolean;
BEGIN
  PERFORM public._assert_organisation_hierarchy_access(p_org_id);

  SELECT o.tenant_id, o.archived_at IS NOT NULL
    INTO v_tenant_id, v_was_archived
  FROM public.organisations o
  WHERE o.id = p_org_id;

  -- Idempotent: no-op when already archived.
  IF v_was_archived THEN
    RETURN jsonb_build_object(
      'success', true,
      'org_id', p_org_id,
      'state', 'archived',
      'message', 'Organisation was already archived'
    );
  END IF;

  UPDATE public.organisations
    SET archived_at = now()
  WHERE id = p_org_id;

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(),
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_tenant_id, p_org_id,
    'child_organisation_archived', p_reason,
    jsonb_build_object('archived_at', NULL),
    jsonb_build_object('archived_at', now()),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'org_id', p_org_id,
    'state', 'archived',
    'message', 'Organisation archived. Participant, registration, result and festival history are preserved.'
  );
END;
$$;


ALTER FUNCTION "public"."archive_child_organisation"("p_org_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_public_result_no"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_next_no INTEGER;
BEGIN
  -- If transitioning to public_visible = true AND it doesn't have a number yet
  IF NEW.public_visible = true AND (OLD.public_visible = false OR OLD.public_visible IS NULL) AND NEW.public_result_no IS NULL THEN
    SELECT COALESCE(MAX(public_result_no), 0) + 1 INTO v_next_no
    FROM public.results
    WHERE tenant_id = NEW.tenant_id;

    NEW.public_result_no := v_next_no;
  END IF;
  
  -- If it was already public_visible but someone set it to true again, and it has no number
  IF NEW.public_visible = true AND NEW.public_result_no IS NULL THEN
    SELECT COALESCE(MAX(public_result_no), 0) + 1 INTO v_next_no
    FROM public.results
    WHERE tenant_id = NEW.tenant_id;

    NEW.public_result_no := v_next_no;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_public_result_no"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_public_result_no_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_next_no INTEGER;
BEGIN
  IF NEW.public_visible = true AND NEW.public_result_no IS NULL THEN
    SELECT COALESCE(MAX(public_result_no), 0) + 1 INTO v_next_no
    FROM public.results
    WHERE tenant_id = NEW.tenant_id;

    NEW.public_result_no := v_next_no;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_public_result_no_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_judge_token_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CODE_GENERATED';
  ELSIF NEW.is_revoked IS TRUE
    AND OLD.is_revoked IS NOT TRUE
    AND NEW.revocation_reason = 'Regenerated by administrator' THEN
    v_action := 'CODE_REGENERATED';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'pending_approval' THEN 'LOGIN_REQUESTED'
      WHEN 'approved' THEN 'LOGIN_APPROVED'
      WHEN 'rejected' THEN 'LOGIN_REJECTED'
      WHEN 'used' THEN 'CODE_USED'
      ELSE NULL
    END;
  END IF;

  IF v_action IS NOT NULL THEN
    INSERT INTO public.judge_activity_logs (
      tenant_id,
      judge_id,
      schedule_id,
      token_id,
      action_type,
      action_details,
      actor_user_id,
      actor_type
    ) VALUES (
      NEW.tenant_id,
      NEW.judge_id,
      NEW.schedule_id,
      NEW.id,
      v_action,
      jsonb_build_object('status', NEW.status),
      auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN 'judge' ELSE 'admin' END
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_judge_token_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_participant_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO audit_logs(table_name, record_id, action, old_value, new_value)
  VALUES ('participants', NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_participant_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_schedule_judge_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    v_action := 'JUDGE_ASSIGNED';
  ELSIF TG_OP = 'UPDATE'
    AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'active' THEN 'JUDGE_ASSIGNED'
      WHEN 'removed' THEN 'JUDGE_REMOVED'
      ELSE NULL
    END;
  END IF;

  IF v_action IS NOT NULL THEN
    INSERT INTO public.judge_activity_logs (
      tenant_id,
      judge_id,
      schedule_id,
      action_type,
      action_details,
      actor_user_id,
      actor_type
    ) VALUES (
      NEW.tenant_id,
      NEW.judge_id,
      NEW.schedule_id,
      v_action,
      jsonb_build_object('reason', NEW.removal_reason),
      auth.uid(),
      'admin'
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_schedule_judge_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_publish_suspense_batch"("p_festival_id" "uuid", "p_tenant_id" "uuid", "p_batch_size" integer DEFAULT 5) RETURNS TABLE("published_item_id" "uuid", "item_name" "text", "suspense_score" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rec RECORD;
BEGIN
  CREATE TEMP TABLE batch_results ON COMMIT DROP AS
  SELECT result_id, get_strategic_publish_order.item_name, get_strategic_publish_order.suspense_score 
  FROM public.get_strategic_publish_order(p_festival_id, p_tenant_id)
  ORDER BY recommended_order ASC
  LIMIT p_batch_size;

  FOR v_rec IN SELECT * FROM batch_results LOOP
    UPDATE public.results
    SET public_visible = true,
        published_at = now()
    WHERE item_id = v_rec.result_id 
      AND festival_id = p_festival_id;
  END LOOP;

  RETURN QUERY SELECT result_id, batch_results.item_name, batch_results.suspense_score FROM batch_results;
END;
$$;


ALTER FUNCTION "public"."auto_publish_suspense_batch"("p_festival_id" "uuid", "p_tenant_id" "uuid", "p_batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_set_category"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only auto-resolve if category_code is not manually set
  IF NEW.category_code IS NULL THEN
    NEW.category_code := resolve_category(NEW.class_std, NEW.dob, NEW.education_type);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_set_category"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_provisioning_operation"("p_operation_type" "text", "p_idempotency_key" "text", "p_parent_id" "uuid" DEFAULT NULL::"uuid", "p_org_name" "text" DEFAULT NULL::"text", "p_username" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_uid uuid := auth.uid();
  v_op public.tenant_provisioning_operations;
  v_parent_archived_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Authorization
  IF p_operation_type = 'child_organisation' THEN
    IF NOT public.is_superadmin() THEN
      IF public.get_my_tenant_id() IS NULL THEN
        RAISE EXCEPTION 'Permission denied: tenant access required or disabled';
      END IF;
      IF p_parent_id IS NULL OR NOT public.is_org_visible(p_parent_id) THEN
        RAISE EXCEPTION 'Permission denied: parent organisation is not within your hierarchy';
      END IF;
    END IF;

    -- Archived parent check
    SELECT archived_at INTO v_parent_archived_at
    FROM public.organisations WHERE id = p_parent_id;

    IF v_parent_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Permission denied: parent organisation is archived';
    END IF;
  ELSIF p_operation_type = 'root_tenant' THEN
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'Permission denied: only superadmin can provision root tenant';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid operation type';
  END IF;

  -- 2. Lookup/Lock existing operation OR Insert new one
  SELECT * INTO v_op
  FROM public.tenant_provisioning_operations
  WHERE operation_type = p_operation_type AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    -- Enforce ownership on existing operation
    IF v_op.requested_by <> v_uid AND NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'Permission denied: operation belongs to another user';
    END IF;
    RETURN v_op.id;
  END IF;

  -- Ensure username format -- child_organisation ONLY. For root_tenant the
  -- p_username parameter carries the admin_email (stored in the admin_email
  -- column below) and must NOT be validated as a username.
  IF p_operation_type = 'child_organisation' AND
     (p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,40}$') THEN
    RAISE EXCEPTION 'Invalid username format';
  END IF;

  -- If not found, create it as pending
  INSERT INTO public.tenant_provisioning_operations (
    operation_type, idempotency_key, requested_by, admin_email, status
  ) VALUES (
    p_operation_type, p_idempotency_key, v_uid, p_username, 'pending'
  ) RETURNING id INTO v_op.id;

  RETURN v_op.id;
END;
$_$;


ALTER FUNCTION "public"."begin_provisioning_operation"("p_operation_type" "text", "p_idempotency_key" "text", "p_parent_id" "uuid", "p_org_name" "text", "p_username" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "item_id" "uuid",
    "venue_id" "uuid",
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "judge_panel_id" "jsonb",
    "status" "text" DEFAULT 'scheduled'::"text",
    "buffer_minutes" integer DEFAULT 15,
    "expected_judge_count" integer DEFAULT 3 NOT NULL,
    "official_participant_bracket" "text" DEFAULT '1'::"text",
    "is_shuffle_locked" boolean DEFAULT false,
    "shuffle_locked_at" timestamp with time zone,
    "shuffle_locked_by" "uuid",
    "notification_sent" boolean DEFAULT false,
    "bulk_break_context" "jsonb",
    CONSTRAINT "schedules_expected_judge_count_check" CHECK ((("expected_judge_count" >= 1) AND ("expected_judge_count" <= 5)))
);


ALTER TABLE "public"."schedules" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_create_schedules"("p_festival_id" "uuid", "p_schedules" "jsonb") RETURNS SETOF "public"."schedules"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_row jsonb;
  v_item_id uuid;
  v_venue_id uuid;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_status text;
  v_buffer_minutes integer;
  v_expected_judge_count integer;
  v_break_context jsonb;
  v_schedule public.schedules%ROWTYPE;
  v_seen_items uuid[] := ARRAY[]::uuid[];
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF p_schedules IS NULL OR jsonb_typeof(p_schedules) <> 'array'
     OR jsonb_array_length(p_schedules) = 0 THEN
    RAISE EXCEPTION 'At least one schedule is required.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_schedules) > 200 THEN
    RAISE EXCEPTION 'Bulk schedule creation is limited to 200 items per request.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.festival_calendar f
    WHERE f.id = p_festival_id
      AND f.tenant_id = v_tenant_id
      AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.'
      USING ERRCODE = '42501';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_schedules)
  LOOP
    v_item_id := NULLIF(v_row ->> 'item_id', '')::uuid;
    v_venue_id := NULLIF(v_row ->> 'venue_id', '')::uuid;
    v_start_time := NULLIF(v_row ->> 'start_time', '')::timestamptz;
    v_end_time := NULLIF(v_row ->> 'end_time', '')::timestamptz;
    v_status := COALESCE(NULLIF(v_row ->> 'status', ''), 'scheduled');
    v_buffer_minutes := GREATEST(0, COALESCE(NULLIF(v_row ->> 'buffer_minutes', '')::integer, 0));
    v_expected_judge_count := COALESCE(NULLIF(v_row ->> 'expected_judge_count', '')::integer, 3);
    v_break_context := v_row -> 'bulk_break_context';

    IF v_item_id IS NULL OR v_venue_id IS NULL OR v_start_time IS NULL OR v_end_time IS NULL THEN
      RAISE EXCEPTION 'Every bulk schedule requires item, venue, start time, and end time.'
        USING ERRCODE = '22023';
    END IF;

    IF v_end_time <= v_start_time THEN
      RAISE EXCEPTION 'Schedule end time must be later than start time.'
        USING ERRCODE = '22023';
    END IF;

    IF v_expected_judge_count < 1 OR v_expected_judge_count > 5 THEN
      RAISE EXCEPTION 'Expected judge count must be between 1 and 5.'
        USING ERRCODE = '22023';
    END IF;

    IF v_break_context IS NOT NULL AND jsonb_typeof(v_break_context) <> 'array' THEN
      RAISE EXCEPTION 'Break context must be an array.'
        USING ERRCODE = '22023';
    END IF;

    IF v_item_id = ANY(v_seen_items) THEN
      RAISE EXCEPTION 'The same competition item cannot be added twice in one bulk request.'
        USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.schedules s
      WHERE s.tenant_id = v_tenant_id
        AND s.festival_id = p_festival_id
        AND s.item_id = v_item_id
    ) THEN
      RAISE EXCEPTION 'This competition item is already scheduled in the selected festival.'
        USING ERRCODE = '23505';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.items i
      WHERE i.id = v_item_id
        AND COALESCE(i.is_active, true) IS TRUE
        AND (i.tenant_id = v_tenant_id OR i.tenant_id IS NULL)
        AND (i.festival_id = p_festival_id OR i.festival_id IS NULL)
    ) THEN
      RAISE EXCEPTION 'The selected competition item is invalid for this festival.'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = v_venue_id
        AND v.tenant_id = v_tenant_id
        AND (
          v.festival_id = p_festival_id
          OR (
            v.festival_id IS NULL
            AND (
              SELECT count(*)
              FROM public.festival_calendar legacy_festival
              WHERE legacy_festival.tenant_id = v_tenant_id
                AND legacy_festival.is_active IS TRUE
            ) = 1
          )
        )
    ) THEN
      RAISE EXCEPTION 'The selected venue is invalid for this festival.'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.schedules (
      tenant_id,
      festival_id,
      item_id,
      venue_id,
      start_time,
      end_time,
      status,
      buffer_minutes,
      expected_judge_count,
      bulk_break_context
    ) VALUES (
      v_tenant_id,
      p_festival_id,
      v_item_id,
      v_venue_id,
      v_start_time,
      v_end_time,
      v_status,
      v_buffer_minutes,
      v_expected_judge_count,
      v_break_context
    )
    RETURNING * INTO v_schedule;

    v_seen_items := array_append(v_seen_items, v_item_id);
    RETURN NEXT v_schedule;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_create_schedules"("p_festival_id" "uuid", "p_schedules" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_update_page_status"("p_page_keys" "text"[], "p_new_status" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_key         text;
  v_result      jsonb;
  v_results     jsonb := '[]'::jsonb;
  v_success_cnt int := 0;
  v_fail_cnt    int := 0;
BEGIN
  IF NOT (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  FOREACH v_key IN ARRAY p_page_keys LOOP
    v_result := public.update_page_status(v_key, p_new_status, p_notes);
    v_results := v_results || jsonb_build_array(v_result);
    IF (v_result->>'success')::boolean THEN
      v_success_cnt := v_success_cnt + 1;
    ELSE
      v_fail_cnt := v_fail_cnt + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total', array_length(p_page_keys, 1),
    'succeeded', v_success_cnt,
    'failed', v_fail_cnt,
    'results', v_results
  );
END;
$$;


ALTER FUNCTION "public"."bulk_update_page_status"("p_page_keys" "text"[], "p_new_status" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_participant_count" integer, "p_is_group" boolean DEFAULT false, "p_bracket_override" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- Legacy shim: treats participant_count as group_size.
  -- competing_teams_count defaults to participant_count to preserve old behavior.
  SELECT public.calculate_festival_points(
    p_festival_id,
    p_grade,
    p_rank,
    p_participant_count,
    p_participant_count,
    p_is_group,
    p_bracket_override
  );
$$;


ALTER FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_participant_count" integer, "p_is_group" boolean, "p_bracket_override" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_group_size" integer, "p_competing_teams_count" integer, "p_is_group" boolean DEFAULT false, "p_bracket_override" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_config public.points_config%ROWTYPE;
  v_brackets jsonb;
  v_bracket jsonb;
  v_grade_index integer;
  v_grade_points integer := 0;
  v_rank_points integer := 0;
  v_rule12_applies boolean := false;
  v_rule12_behavior text;
BEGIN
  SELECT pc.*
  INTO v_config
  FROM public.points_config pc
  WHERE pc.festival_id = p_festival_id
  ORDER BY pc.config_version DESC
  LIMIT 1;

  IF v_config.id IS NULL THEN
    RAISE EXCEPTION 'Points configuration is missing for this festival.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_config.tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to calculate points for this festival.';
  END IF;

  -- Choose bracket list based on whether this is a group item with separate brackets
  v_brackets := CASE
    WHEN p_is_group AND v_config.separate_group_brackets
      THEN v_config.group_point_brackets
    ELSE v_config.point_brackets
  END;

  -- Try bracket override first
  IF p_bracket_override IS NOT NULL AND v_config.allow_bracket_override THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
      AND bracket.value->>'key' = p_bracket_override
    LIMIT 1;
  END IF;

  -- Auto-select bracket based on GROUP SIZE (how many members per team entry)
  IF v_bracket IS NULL THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
      AND p_group_size >= (bracket.value->>'min')::integer
      AND (
        bracket.value->'max' IS NULL
        OR bracket.value->'max' = 'null'::jsonb
        OR p_group_size <= (bracket.value->>'max')::integer
      )
    ORDER BY (bracket.value->>'min')::integer DESC
    LIMIT 1;
  END IF;

  -- Fallback: pick largest bracket with min <= group_size
  IF v_bracket IS NULL THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
      AND (bracket.value->>'min')::integer <= p_group_size
    ORDER BY (bracket.value->>'min')::integer DESC
    LIMIT 1;
  END IF;

  -- Last resort: first enabled bracket
  IF v_bracket IS NULL THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
    ORDER BY (bracket.value->>'min')::integer ASC
    LIMIT 1;
  END IF;

  IF v_bracket IS NULL THEN
    RAISE EXCEPTION 'No enabled point bracket matches the group size.';
  END IF;

  v_grade_index := CASE p_grade
    WHEN 'A+' THEN 0
    WHEN 'A'  THEN 1
    WHEN 'B'  THEN 2
    WHEN 'C'  THEN 3
    ELSE NULL
  END;

  IF v_grade_index IS NOT NULL THEN
    v_grade_points := COALESCE(
      (v_bracket->'points'->>v_grade_index)::integer,
      0
    );
  END IF;

  v_rank_points := CASE p_rank
    WHEN 1 THEN COALESCE(v_config.rank_1_points, 5)
    WHEN 2 THEN COALESCE(v_config.rank_2_points, 3)
    WHEN 3 THEN COALESCE(v_config.rank_3_points, 1)
    ELSE 0
  END;

  -- Rule 12: based on COMPETING TEAMS COUNT (not group size!)
  v_rule12_applies :=
    v_config.less_than_3_teams_rule
    AND p_competing_teams_count < v_config.rule12_min_teams;
  v_rule12_behavior := COALESCE(v_config.rule12_behavior, 'grade_only');

  IF v_rule12_applies AND v_rule12_behavior = 'grade_only' THEN
    v_rank_points := 0;
  ELSIF v_rule12_applies AND v_rule12_behavior = 'no_points' THEN
    v_rank_points := 0;
    v_grade_points := 0;
  END IF;

  RETURN jsonb_build_object(
    'total',                v_rank_points + v_grade_points,
    'rank_points',          v_rank_points,
    'grade_points',         v_grade_points,
    'bracket_key',          v_bracket->>'key',
    'bracket_label',        v_bracket->>'label',
    'rule12_applied',       v_rule12_applies,
    'rule12_behavior',      v_rule12_behavior,
    'grade_only',           v_rule12_applies AND v_rule12_behavior = 'grade_only',
    'config_version',       v_config.config_version,
    'points_mode',          v_config.points_mode,
    'group_size',           p_group_size,
    'competing_teams_count',p_competing_teams_count,
    'is_group',             p_is_group
  );
END;
$$;


ALTER FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_group_size" integer, "p_competing_teams_count" integer, "p_is_group" boolean, "p_bracket_override" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_festival_team_admin"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.festival_teams 
    WHERE id = p_team_id 
    AND parent_tenant_id = public.get_my_tenant_id()
  );
$$;


ALTER FUNCTION "public"."check_festival_team_admin"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_ghost_code_letters"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If participant is marked unverified or rejected, clear their code letter automatically
  IF NEW.is_verified = false OR NEW.status = 'rejected' THEN
    NEW.code_letter := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."clear_ghost_code_letters"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_username_login_attempt"("p_scope" "text", "p_subject_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_limit integer;
  v_count integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_scope NOT IN ('ip', 'username')
     OR p_subject_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  v_limit := CASE p_scope WHEN 'ip' THEN 30 ELSE 8 END;

  INSERT INTO public.username_login_rate_limits AS rate_limit (
    scope, subject_hash, window_started_at, attempt_count, updated_at
  ) VALUES (
    p_scope, p_subject_hash, v_now, 1, v_now
  )
  ON CONFLICT (scope, subject_hash) DO UPDATE SET
    window_started_at = CASE
      WHEN rate_limit.window_started_at <= v_now - interval '1 minute' THEN v_now
      ELSE rate_limit.window_started_at
    END,
    attempt_count = CASE
      WHEN rate_limit.window_started_at <= v_now - interval '1 minute' THEN 1
      ELSE rate_limit.attempt_count + 1
    END,
    updated_at = v_now
  RETURNING attempt_count INTO v_count;

  RETURN v_count <= v_limit;
END;
$_$;


ALTER FUNCTION "public"."consume_username_login_attempt"("p_scope" "text", "p_subject_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_page_snapshot"("p_trigger_action" "text" DEFAULT 'MANUAL'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_snapshot_data jsonb;
  v_snapshot_name text;
  v_snapshot_id   uuid;
BEGIN
  IF NOT (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  -- Capture full state
  SELECT jsonb_agg(row_to_json(sp)::jsonb) INTO v_snapshot_data FROM system_pages sp;

  v_snapshot_name := 'Snapshot — ' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH12:MI AM');

  INSERT INTO page_snapshots (snapshot_name, snapshot_data, trigger_action, created_by)
  VALUES (v_snapshot_name, v_snapshot_data, p_trigger_action, auth.uid())
  RETURNING id INTO v_snapshot_id;

  RETURN jsonb_build_object(
    'success', true,
    'snapshot_id', v_snapshot_id,
    'snapshot_name', v_snapshot_name
  );
END;
$$;


ALTER FUNCTION "public"."create_page_snapshot"("p_trigger_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_tenant_admin"("p_org_id" "uuid", "p_admin_email" "text", "p_admin_password" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_name text;
  v_org_type text;
  v_tenant_id uuid;
  v_user_id uuid;
BEGIN
  -- 1. Check if org exists and get details
  SELECT name, org_type INTO v_org_name, v_org_type FROM organisations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organisation not found');
  END IF;

  -- 2. Check if already has a tenant
  IF EXISTS (SELECT 1 FROM organisations WHERE id = p_org_id AND tenant_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organisation already has a tenant active');
  END IF;

  -- 3. Check if email is already in use
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_admin_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email is already registered to another user');
  END IF;

  -- 4. Create Tenant
  INSERT INTO tenants (name, org_type, subscription_status)
  VALUES (v_org_name, v_org_type, 'active')
  RETURNING id INTO v_tenant_id;

  -- 5. Update Organisation
  UPDATE organisations SET tenant_id = v_tenant_id WHERE id = p_org_id;

  -- 6. Create Auth User
  v_user_id := gen_random_uuid();
  
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at, 
    aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, is_super_admin
  ) VALUES (
    v_user_id, '00000000-0000-0000-0000-000000000000', p_admin_email, 
    extensions.crypt(p_admin_password, extensions.gen_salt('bf')), now(), 
    'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb, 
    format('{"full_name":"%s"}', v_org_name || ' Admin')::jsonb, 
    now(), now(), '', '', '', false
  );

  -- Insert into identities for email login support
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id, format('{"sub":"%s","email":"%s"}', v_user_id, p_admin_email)::jsonb, 
    'email', p_admin_email, now(), now(), now()
  );

  -- 7. Update or Insert Profile
  INSERT INTO public.profiles (id, full_name, role, tenant_id, is_superadmin)
  VALUES (v_user_id, v_org_name || ' Admin', 'admin', v_tenant_id, false)
  ON CONFLICT (id) DO UPDATE 
  SET role = 'admin', tenant_id = v_tenant_id, full_name = EXCLUDED.full_name;

  RETURN jsonb_build_object('success', true, 'tenant_id', v_tenant_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."create_tenant_admin"("p_org_id" "uuid", "p_admin_email" "text", "p_admin_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_child_organisation"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.archive_child_organisation(
    p_org_id,
    'Legacy delete_child_organisation compatibility call'
  );
END;
$$;


ALTER FUNCTION "public"."delete_child_organisation"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_festival_category_safely"("p_category_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_category public.festival_categories%ROWTYPE;
  v_participant_count integer;
  v_item_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_category
  FROM public.festival_categories
  WHERE id = p_category_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'category_id', p_category_id);
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_category.tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to delete this category.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_participant_count
  FROM public.participants p
  WHERE p.festival_id = v_category.festival_id
    AND p.tenant_id = v_category.tenant_id
    AND lower(btrim(p.category_code)) = lower(btrim(v_category.code));

  SELECT count(*)::integer INTO v_item_count
  FROM public.items i
  WHERE i.festival_id = v_category.festival_id
    AND i.tenant_id = v_category.tenant_id
    AND EXISTS (
      SELECT 1 FROM unnest(i.category_codes) AS item_category
      WHERE lower(btrim(item_category)) = lower(btrim(v_category.code))
    );

  IF v_participant_count > 0 OR v_item_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'blocked',
      'category_id', v_category.id,
      'participant_count', v_participant_count,
      'item_count', v_item_count,
      'message', format(
        'Category cannot be deleted because it is used by %s participant(s) and %s item(s). Archive or disable it instead; history is preserved.',
        v_participant_count, v_item_count
      )
    );
  END IF;

  DELETE FROM public.festival_categories WHERE id = v_category.id;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (
      v_category.tenant_id,
      auth.uid(),
      'DELETE_FESTIVAL_CATEGORY',
      'festival_categories',
      v_category.id,
      to_jsonb(v_category),
      jsonb_build_object('status', 'removed', 'removed_at', now())
    );
  END IF;

  RETURN jsonb_build_object('status', 'removed', 'category_id', v_category.id);
END;
$$;


ALTER FUNCTION "public"."delete_festival_category_safely"("p_category_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_festival_category_safely"("p_category_id" "uuid") IS 'Deletes an unused festival category only. Participant/item references block deletion and preserve history.';



CREATE OR REPLACE FUNCTION "public"."delete_judge_safely"("p_judge_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT j.tenant_id
  INTO v_tenant_id
  FROM public.judges j
  WHERE j.id = p_judge_id
  FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Judge not found.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to delete this judge.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    WHERE a.judge_id = p_judge_id
  ) THEN
    RAISE EXCEPTION
      'This judge has event assignment history and cannot be deleted. Remove the judge from active panels instead.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mark_entries me WHERE me.judge_id = p_judge_id
  ) OR EXISTS (
    SELECT 1 FROM public.judge_tokens jt WHERE jt.judge_id = p_judge_id
  ) OR EXISTS (
    SELECT 1 FROM public.judge_activity_logs al WHERE al.judge_id = p_judge_id
  ) THEN
    RAISE EXCEPTION
      'This judge has access-code, marks, or audit history and cannot be deleted.';
  END IF;

  DELETE FROM public.judges
  WHERE id = p_judge_id
    AND tenant_id = v_tenant_id;
END;
$$;


ALTER FUNCTION "public"."delete_judge_safely"("p_judge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."disable_tenant_access"("p_org_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_was_disabled boolean;
BEGIN
  PERFORM public._assert_superadmin_access();

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation is required';
  END IF;

  SELECT t.id, COALESCE(t.access_disabled, false)
    INTO v_tenant_id, v_was_disabled
  FROM public.organisations o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE o.id = p_org_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Organisation not found or not linked to a tenant';
  END IF;

  -- Idempotent: no-op when already disabled.
  IF v_was_disabled THEN
    RETURN jsonb_build_object(
      'success', true,
      'tenant_id', v_tenant_id,
      'org_id', p_org_id,
      'state', 'disabled',
      'message', 'Tenant access was already disabled'
    );
  END IF;

  UPDATE public.tenants SET access_disabled = true WHERE id = v_tenant_id;

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(), 'superadmin', v_tenant_id, p_org_id,
    'tenant_disabled', p_reason,
    jsonb_build_object('access_disabled', false),
    jsonb_build_object('access_disabled', true),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'org_id', p_org_id,
    'state', 'disabled',
    'message', 'Tenant access disabled. Festival data and history are preserved. This action can be reversed.'
  );
END;
$$;


ALTER FUNCTION "public"."disable_tenant_access"("p_org_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enable_tenant_access"("p_org_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_was_disabled boolean;
  v_admin_exists boolean;
BEGIN
  PERFORM public._assert_superadmin_access();

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation is required';
  END IF;

  SELECT t.id, COALESCE(t.access_disabled, false)
    INTO v_tenant_id, v_was_disabled
  FROM public.organisations o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE o.id = p_org_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Organisation not found or not linked to a tenant';
  END IF;

  -- Idempotent: no-op when already enabled.
  IF NOT v_was_disabled THEN
    RETURN jsonb_build_object(
      'success', true,
      'tenant_id', v_tenant_id,
      'org_id', p_org_id,
      'state', 'enabled',
      'message', 'Tenant access was already enabled'
    );
  END IF;

  UPDATE public.tenants SET access_disabled = false WHERE id = v_tenant_id;

  -- If a historical revoke removed the admin auth account, report it clearly.
  -- We never recreate credentials or profiles.
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE p.tenant_id = v_tenant_id
      AND p.role = 'admin'
  ) INTO v_admin_exists;

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(), 'superadmin', v_tenant_id, p_org_id,
    'tenant_enabled', p_reason,
    jsonb_build_object('access_disabled', true),
    jsonb_build_object('access_disabled', false),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'org_id', p_org_id,
    'state', CASE WHEN v_admin_exists THEN 'enabled' ELSE 'TENANT_ENABLED_BUT_ADMIN_ACCOUNT_MISSING' END,
    'message', CASE WHEN v_admin_exists THEN 'Tenant access re-enabled.' ELSE 'Tenant access re-enabled, but no admin auth account was found. No credentials were created.' END
  );
END;
$$;


ALTER FUNCTION "public"."enable_tenant_access"("p_org_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_active_judge_assignment_for_marks"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = NEW.schedule_id
      AND a.judge_id = NEW.judge_id
      AND a.tenant_id = NEW.tenant_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This judge is no longer assigned to the event.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_active_judge_assignment_for_marks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_points_config_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.config_version <> OLD.config_version + 1 THEN
    RAISE EXCEPTION
      'Points configuration is stale. Reload the latest version before saving.';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_points_config_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_candidate_profile_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  base_slug text;
  suffix text;
BEGIN
  suffix := left(NEW.id::text, 8);

  IF NEW.profile_slug IS NULL OR trim(NEW.profile_slug) = '' THEN
    base_slug := COALESCE(public.slugify_candidate_name(NEW.name), 'candidate');
  ELSE
    base_slug := COALESCE(public.slugify_candidate_name(NEW.profile_slug), 'candidate');
  END IF;

  base_slug := regexp_replace(base_slug, '-' || suffix || '$', '');
  NEW.profile_slug := base_slug || '-' || suffix;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."ensure_candidate_profile_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_bulk_unit_assignment"("p_participant_ids" "uuid"[], "p_expected_hashes" "text"[], "p_target_unit_id" "uuid", "p_batch_id" "uuid", "p_tenant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_pid uuid;
  v_expected_hash text;
  v_actual_hash text;
  v_updated_count int := 0;
  v_skipped_count int := 0;
  v_failed_count int := 0;
  v_participant_record record;
  v_target_org_tenant_id uuid;
  v_changed_by uuid;
  i int;
BEGIN
  -- Get active user ID
  v_changed_by := auth.uid();

  -- 1. Server-side validation: Verify user manages target organisation
  IF NOT (public.is_superadmin() OR public.is_org_visible(p_target_unit_id)) THEN
    RAISE EXCEPTION 'Permission denied: Cannot reassign to target organisation';
  END IF;

  -- 2. Verify target organisation belongs to the selected tenant hierarchy
  SELECT tenant_id INTO v_target_org_tenant_id FROM organisations o WHERE o.id = p_target_unit_id;
  IF NOT (
    public.is_superadmin() OR 
    EXISTS (SELECT 1 FROM public.get_visible_organisations(p_tenant_id) WHERE id = p_target_unit_id)
  ) THEN
    RAISE EXCEPTION 'Target organisation does not belong to the selected tenant hierarchy';
  END IF;

  -- 3. Loop and update with locking & validation
  FOR i IN 1..array_length(p_participant_ids, 1) LOOP
    v_pid := p_participant_ids[i];
    v_expected_hash := p_expected_hashes[i];

    -- Select with lock to avoid race conditions (FOR UPDATE SKIP LOCKED)
    SELECT id, name, category_code, chest_number, organisation_id, is_locked, tenant_id, updated_at
    INTO v_participant_record
    FROM participants
    WHERE id = v_pid
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Validate that the caller manages the participant's current organisation
    IF NOT (
      public.is_superadmin() OR 
      v_participant_record.organisation_id IS NULL OR
      EXISTS (SELECT 1 FROM public.get_visible_organisations(p_tenant_id) WHERE id = v_participant_record.organisation_id)
    ) THEN
      v_failed_count := v_failed_count + 1;
      CONTINUE;
    END IF;

    -- Validate integrity hash
    v_actual_hash := md5(
      coalesce(v_participant_record.id::text, '') ||
      coalesce(v_participant_record.updated_at::text, '') ||
      coalesce(v_participant_record.name, '') ||
      coalesce(v_participant_record.chest_number, '') ||
      coalesce(v_participant_record.category_code, '') ||
      coalesce(v_participant_record.organisation_id::text, '')
    );

    IF v_actual_hash IS DISTINCT FROM v_expected_hash THEN
      RAISE EXCEPTION 'Data integrity check failed: Participant data mutated during reassignment.';
    END IF;

    -- If locked, skip
    IF v_participant_record.is_locked THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- If already in target unit, skip
    IF v_participant_record.organisation_id = p_target_unit_id THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Log audit entry
    INSERT INTO participant_unit_audit_logs (
      participant_id,
      old_unit_id,
      new_unit_id,
      changed_by,
      batch_id,
      tenant_id
    ) VALUES (
      v_pid,
      v_participant_record.organisation_id,
      p_target_unit_id,
      v_changed_by,
      p_batch_id,
      p_tenant_id
    );

    -- Update participant unit and tenant
    UPDATE participants
    SET organisation_id = p_target_unit_id,
        tenant_id = v_target_org_tenant_id,
        updated_at = now()
    WHERE id = v_pid;

    -- Update registrations unit and tenant
    UPDATE registrations
    SET organisation_id = p_target_unit_id,
        tenant_id = v_target_org_tenant_id
    WHERE participant_id = v_pid;

    -- Touch old organisation to trigger realtime / cache bump
    IF v_participant_record.organisation_id IS NOT NULL THEN
      UPDATE organisations SET name = name WHERE id = v_participant_record.organisation_id;
    END IF;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  -- Touch target organisation to trigger realtime / cache bump
  UPDATE organisations SET name = name WHERE id = p_target_unit_id;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'skipped_count', v_skipped_count,
    'failed_count', v_failed_count,
    'batch_id', p_batch_id
  );
END;
$$;


ALTER FUNCTION "public"."execute_bulk_unit_assignment"("p_participant_ids" "uuid"[], "p_expected_hashes" "text"[], "p_target_unit_id" "uuid", "p_batch_id" "uuid", "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_general_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_category text;
  v_gender text;
  v_participant_id_text text;
  v_events jsonb;
  v_event jsonb;
  v_event_code text;
  v_general_division text;
  v_raw_members jsonb;

  v_participant_id uuid;
  v_item_id uuid;

  v_reused_participants integer := 0;
  v_created_participants integer := 0;
  v_imported_registrations integer := 0;
  v_skipped_registrations integer := 0;

  v_errors jsonb := '[]'::jsonb;
  v_unmapped jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- Loop through participants
  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := trim(v_participant->>'chest_no');
    v_name := upper(trim(v_participant->>'name'));
    v_category := trim(v_participant->>'category_code');
    v_gender := v_participant->>'gender';
    v_participant_id_text := v_participant->>'participant_id';
    v_events := v_participant->'events';

    IF v_participant_id_text IS NULL OR v_participant_id_text = '' THEN
      -- Create new participant
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, gender, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, v_category, v_gender, 'approved'
      ) RETURNING id INTO v_participant_id;

      v_created_participants := v_created_participants + 1;
    ELSE
      -- Reuse existing participant: parse id safely and verify ownership
      BEGIN
        v_participant_id := v_participant_id_text::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'error', 'Invalid participant_id provided');
        CONTINUE;
      END;

      IF NOT EXISTS (
        SELECT 1 FROM public.participants
        WHERE id = v_participant_id
          AND tenant_id = p_tenant_id
          AND festival_id = p_festival_id
      ) THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'participant_id', v_participant_id_text, 'error', 'Reused participant does not belong to this tenant/festival');
        CONTINUE;
      END IF;

      v_reused_participants := v_reused_participants + 1;
    END IF;

    -- Process registrations
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event := v_events->i;
      v_event_code := trim(v_event->>'item_code');
      v_general_division := trim(v_event->>'general_division');
      v_raw_members := v_event->'raw_group_members';

      -- Resolve item mapping (festival-scoped)
      v_item_id := NULL;
      SELECT id INTO v_item_id
      FROM public.items
      WHERE festival_id = p_festival_id AND item_code = v_event_code;

      IF v_item_id IS NULL THEN
        -- Missing mapping
        v_unmapped := v_unmapped || jsonb_build_object('chest', v_chest, 'item_code', v_event_code);
        v_skipped_registrations := v_skipped_registrations + 1;
        CONTINUE;
      END IF;

      -- Insert registration
      BEGIN
        INSERT INTO public.registrations (
          tenant_id, festival_id, item_id, participant_id, status, general_division, raw_group_members
        ) VALUES (
          p_tenant_id, p_festival_id, v_item_id, v_participant_id, 'approved', v_general_division, v_raw_members
        ) ON CONFLICT (participant_id, item_id) DO NOTHING;

        IF FOUND THEN
          v_imported_registrations := v_imported_registrations + 1;
        ELSE
          v_skipped_registrations := v_skipped_registrations + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', 'Registration could not be created');
        v_skipped_registrations := v_skipped_registrations + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'reused_participants', v_reused_participants,
    'created_participants', v_created_participants,
    'imported_registrations', v_imported_registrations,
    'skipped_registrations', v_skipped_registrations,
    'unmapped_events', v_unmapped,
    'errors', v_errors
  );
END;
$$;


ALTER FUNCTION "public"."execute_general_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_hs_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_events jsonb;
  v_event_code text;

  v_participant_id uuid;
  v_existing_name text;
  v_existing_gender text;

  v_detected_gender text;
  v_is_girls_only boolean;

  v_item_id uuid;
  v_item_type text;

  v_imported_participants integer := 0;
  v_skipped_participants integer := 0;
  v_imported_registrations integer := 0;
  v_skipped_registrations integer := 0;
  v_girls_auto_assigned integer := 0;

  v_errors jsonb := '[]'::jsonb;
  v_unmapped jsonb := '[]'::jsonb;
  v_gender_conflicts jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := trim(v_participant->>'chest_no');
    v_name := upper(trim(v_participant->>'name'));
    v_events := v_participant->'events';

    v_detected_gender := NULL;
    v_is_girls_only := false;

    -- Detect Girls-only items for HS: HS-018 to HS-023
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');
      IF v_event_code IN ('HS-018', 'HS-019', 'HS-020', 'HS-021', 'HS-022', 'HS-023') THEN
        v_is_girls_only := true;
      END IF;
    END LOOP;

    IF v_is_girls_only THEN
      v_detected_gender := 'Girls';
    END IF;

    -- Check if participant already exists BY CHEST NUMBER (scoped to permitted tenant/festival)
    v_participant_id := NULL;
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      v_skipped_participants := v_skipped_participants + 1;
      IF v_is_girls_only AND v_existing_gender = 'Boys' THEN
         v_gender_conflicts := v_gender_conflicts || jsonb_build_object('chest', v_chest, 'name', v_name, 'issue', 'Registered in girls-only item but existing gender is Boys');
      END IF;
    ELSE
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, gender, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'HS', v_detected_gender, 'approved'
      ) RETURNING id INTO v_participant_id;

      IF v_detected_gender = 'Girls' THEN
         v_girls_auto_assigned := v_girls_auto_assigned + 1;
      END IF;

      v_imported_participants := v_imported_participants + 1;
    END IF;

    -- Process registrations
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');

      -- Resolve item mapping (festival-scoped)
      v_item_id := NULL;
      SELECT id, participation_type INTO v_item_id, v_item_type
      FROM public.items
      WHERE festival_id = p_festival_id AND item_code = v_event_code;

      IF v_item_id IS NULL THEN
        v_unmapped := v_unmapped || jsonb_build_object('chest', v_chest, 'item_code', v_event_code);
        v_skipped_registrations := v_skipped_registrations + 1;
        CONTINUE;
      END IF;

      BEGIN
        INSERT INTO public.registrations (
          tenant_id, festival_id, item_id, participant_id, status
        ) VALUES (
          p_tenant_id, p_festival_id, v_item_id, v_participant_id, 'approved'
        ) ON CONFLICT (participant_id, item_id) DO NOTHING;

        IF FOUND THEN
          v_imported_registrations := v_imported_registrations + 1;
        ELSE
          v_skipped_registrations := v_skipped_registrations + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', 'Registration could not be created');
        v_skipped_registrations := v_skipped_registrations + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_participants,
    'skipped_participants', v_skipped_participants,
    'imported_registrations', v_imported_registrations,
    'skipped_registrations', v_skipped_registrations,
    'girls_auto_assigned', v_girls_auto_assigned,
    'unmapped_events', v_unmapped,
    'gender_conflicts', v_gender_conflicts,
    'errors', v_errors
  );
END;
$$;


ALTER FUNCTION "public"."execute_hs_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_hss_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_events jsonb;
  v_event_code text;

  v_participant_id uuid;
  v_existing_name text;
  v_existing_gender text;

  v_detected_gender text;
  v_is_girls_only boolean;

  v_item_id uuid;
  v_item_type text;

  v_imported_participants integer := 0;
  v_skipped_participants integer := 0;
  v_imported_registrations integer := 0;
  v_skipped_registrations integer := 0;
  v_girls_auto_assigned integer := 0;

  v_errors jsonb := '[]'::jsonb;
  v_unmapped jsonb := '[]'::jsonb;
  v_gender_conflicts jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := trim(v_participant->>'chest_no');
    v_name := upper(trim(v_participant->>'name'));
    v_events := v_participant->'events';

    v_detected_gender := NULL;
    v_is_girls_only := false;

    -- Detect Girls-only items for HSS: HSS-017 to HSS-020
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');
      IF v_event_code IN ('HSS-017', 'HSS-018', 'HSS-019', 'HSS-020') THEN
        v_is_girls_only := true;
      END IF;
    END LOOP;

    IF v_is_girls_only THEN
      v_detected_gender := 'Girls';
    END IF;

    -- Check if participant already exists BY CHEST NUMBER (scoped to permitted tenant/festival)
    v_participant_id := NULL;
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      v_skipped_participants := v_skipped_participants + 1;
      IF v_is_girls_only AND v_existing_gender = 'Boys' THEN
         v_gender_conflicts := v_gender_conflicts || jsonb_build_object('chest', v_chest, 'name', v_name, 'issue', 'Registered in girls-only item but existing gender is Boys');
      END IF;
    ELSE
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, gender, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'HSS', v_detected_gender, 'approved'
      ) RETURNING id INTO v_participant_id;

      IF v_detected_gender = 'Girls' THEN
         v_girls_auto_assigned := v_girls_auto_assigned + 1;
      END IF;

      v_imported_participants := v_imported_participants + 1;
    END IF;

    -- Process registrations
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');

      -- Resolve item mapping (festival-scoped)
      v_item_id := NULL;
      SELECT id, participation_type INTO v_item_id, v_item_type
      FROM public.items
      WHERE festival_id = p_festival_id AND item_code = v_event_code;

      IF v_item_id IS NULL THEN
        v_unmapped := v_unmapped || jsonb_build_object('chest', v_chest, 'item_code', v_event_code);
        v_skipped_registrations := v_skipped_registrations + 1;
        CONTINUE;
      END IF;

      BEGIN
        INSERT INTO public.registrations (
          tenant_id, festival_id, item_id, participant_id, status
        ) VALUES (
          p_tenant_id, p_festival_id, v_item_id, v_participant_id, 'approved'
        ) ON CONFLICT (participant_id, item_id) DO NOTHING;

        IF FOUND THEN
          v_imported_registrations := v_imported_registrations + 1;
        ELSE
          v_skipped_registrations := v_skipped_registrations + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', 'Registration could not be created');
        v_skipped_registrations := v_skipped_registrations + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_participants,
    'skipped_participants', v_skipped_participants,
    'imported_registrations', v_imported_registrations,
    'skipped_registrations', v_skipped_registrations,
    'girls_auto_assigned', v_girls_auto_assigned,
    'unmapped_events', v_unmapped,
    'gender_conflicts', v_gender_conflicts,
    'errors', v_errors
  );
END;
$$;


ALTER FUNCTION "public"."execute_hss_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_junior_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_items jsonb;
  v_item_code text;
  v_participant_id uuid;
  v_existing_name text;
  v_item_id uuid;

  v_imported_parts int := 0;
  v_skipped_parts int := 0;
  v_imported_regs int := 0;
  v_skipped_regs int := 0;

  v_invalid_items jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- 4a. Scoped Advisory Lock
  -- Lock to prevent concurrent imports on the same festival
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text));

  -- Ensure session is valid AND scoped to the target tenant/festival
  IF p_session_id IS NOT NULL THEN
    UPDATE public.import_sessions
    SET status = 'processing'
    WHERE id = p_session_id AND status = 'pending'
      AND tenant_id = p_tenant_id AND festival_id = p_festival_id;
  END IF;

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := v_participant->>'chest_number';
    v_name := v_participant->>'name';
    v_items := v_participant->'items';

    -- Check if participant exists (scoped to the permitted tenant/festival)
    SELECT id, name INTO v_participant_id, v_existing_name
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      -- Existing participant
      IF v_existing_name <> v_name THEN
        -- CRITICAL: Name mismatch
        v_errors := v_errors || jsonb_build_object(
          'chest_number', v_chest,
          'error', 'Name mismatch for existing chest number',
          'existing_name', v_existing_name,
          'import_name', v_name
        );
        v_skipped_parts := v_skipped_parts + 1;
        CONTINUE; -- Skip entire participant
      ELSE
        v_skipped_parts := v_skipped_parts + 1; -- Idempotent skip
      END IF;
    ELSE
      -- Create new participant
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'JUNIOR', 'approved'
      ) RETURNING id INTO v_participant_id;

      v_imported_parts := v_imported_parts + 1;
    END IF;

    -- Process Items
    FOR v_item_code IN SELECT * FROM jsonb_array_elements_text(v_items)
    LOOP
      SELECT id INTO v_item_id
      FROM public.items
      WHERE festival_id = p_festival_id
        AND item_code = v_item_code
      LIMIT 1;

      IF v_item_id IS NOT NULL THEN
        -- Safely insert registration
        INSERT INTO public.registrations (
          tenant_id, festival_id, participant_id, item_id, status
        ) VALUES (
          p_tenant_id, p_festival_id, v_participant_id, v_item_id, 'approved'
        )
        ON CONFLICT (participant_id, item_id, festival_id) DO NOTHING;

        IF FOUND THEN
          v_imported_regs := v_imported_regs + 1;
        ELSE
          v_skipped_regs := v_skipped_regs + 1;
        END IF;
      ELSE
        v_invalid_items := v_invalid_items || jsonb_build_object(
          'chest_number', v_chest,
          'item_code', v_item_code,
          'error', 'Item not found or not in JUNIOR category'
        );
      END IF;
    END LOOP;

  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_parts,
    'skipped_participants', v_skipped_parts,
    'imported_registrations', v_imported_regs,
    'skipped_registrations', v_skipped_regs,
    'invalid_items', v_invalid_items,
    'errors', v_errors,
    'warnings', v_warnings
  );
END;
$$;


ALTER FUNCTION "public"."execute_junior_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_lp_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_events jsonb;
  v_event_code text;

  v_participant_id uuid;
  v_existing_name text;
  v_existing_gender text;

  v_detected_gender text;
  v_is_girls_only boolean;

  v_item_id uuid;
  v_item_type text;

  v_imported_participants integer := 0;
  v_skipped_participants integer := 0;
  v_imported_registrations integer := 0;
  v_skipped_registrations integer := 0;
  v_girls_auto_assigned integer := 0;

  v_errors jsonb := '[]'::jsonb;
  v_unmapped jsonb := '[]'::jsonb;
  v_gender_conflicts jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- Loop through participants
  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := trim(v_participant->>'chest_no');
    -- Auto uppercase the name as requested, preserve spelling
    v_name := upper(trim(v_participant->>'name'));
    v_events := v_participant->'events';

    v_detected_gender := NULL;
    v_is_girls_only := false;

    -- Detect Girls-only items for LP: LP-011, LP-012, LP-013, LP-014
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');
      IF v_event_code IN ('LP-011', 'LP-012', 'LP-013', 'LP-014') THEN
        v_is_girls_only := true;
      END IF;
    END LOOP;

    IF v_is_girls_only THEN
      v_detected_gender := 'Girls';
    END IF;

    -- Check if participant already exists BY CHEST NUMBER (scoped to permitted tenant/festival)
    v_participant_id := NULL;
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      v_skipped_participants := v_skipped_participants + 1;

      -- Check gender conflict
      IF v_is_girls_only AND v_existing_gender = 'Boys' THEN
         v_gender_conflicts := v_gender_conflicts || jsonb_build_object('chest', v_chest, 'name', v_name, 'issue', 'Registered in girls-only item but existing gender is Boys');
      END IF;

    ELSE
      -- Create new participant with LP category
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, gender, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'LP', v_detected_gender, 'approved'
      ) RETURNING id INTO v_participant_id;

      IF v_detected_gender = 'Girls' THEN
         v_girls_auto_assigned := v_girls_auto_assigned + 1;
      END IF;

      v_imported_participants := v_imported_participants + 1;
    END IF;

    -- Process registrations
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');

      -- Resolve item mapping (festival-scoped)
      v_item_id := NULL;
      SELECT id, participation_type INTO v_item_id, v_item_type
      FROM public.items
      WHERE festival_id = p_festival_id AND item_code = v_event_code;

      IF v_item_id IS NULL THEN
        -- Missing mapping
        v_unmapped := v_unmapped || jsonb_build_object('chest', v_chest, 'item_code', v_event_code);
        v_skipped_registrations := v_skipped_registrations + 1;
        CONTINUE;
      END IF;

      -- Insert registration
      BEGIN
        INSERT INTO public.registrations (
          tenant_id, festival_id, item_id, participant_id, status
        ) VALUES (
          p_tenant_id, p_festival_id, v_item_id, v_participant_id, 'approved'
        ) ON CONFLICT (participant_id, item_id) DO NOTHING;

        IF FOUND THEN
          v_imported_registrations := v_imported_registrations + 1;
        ELSE
          v_skipped_registrations := v_skipped_registrations + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', 'Registration could not be created');
        v_skipped_registrations := v_skipped_registrations + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_participants,
    'skipped_participants', v_skipped_participants,
    'imported_registrations', v_imported_registrations,
    'skipped_registrations', v_skipped_registrations,
    'girls_auto_assigned', v_girls_auto_assigned,
    'unmapped_events', v_unmapped,
    'gender_conflicts', v_gender_conflicts,
    'errors', v_errors
  );
END;
$$;


ALTER FUNCTION "public"."execute_lp_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_schedule_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_schedules" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_schedule jsonb;
  v_category text;
  v_venue_name text;
  v_item_name text;
  v_item_code text;
  v_section text;
  v_date text;
  v_start_str text;
  v_end_str text;
  v_duration int;
  v_stage_order int;
  v_max_parts int;
  v_status text;

  v_item_id uuid;
  v_db_item_name text;
  v_item_categories text[];
  v_venue_id uuid;

  v_start_time timestamptz;
  v_end_time timestamptz;

  v_imported_count int := 0;
  v_skipped_count int := 0;
  v_conflict_count int := 0;
  v_invalid_count int := 0;

  v_errors jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_db_overlap_item text;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- 1. Scoped Advisory Lock to prevent concurrent scheduling operations
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text || 'schedules'));

  FOR v_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    v_category := v_schedule->>'category';
    v_venue_name := v_schedule->>'venue';
    v_item_name := v_schedule->>'item_name';
    v_item_code := v_schedule->>'item_code';
    v_section := v_schedule->>'section';
    v_date := v_schedule->>'date';
    v_start_str := v_schedule->>'start_time';
    v_end_str := v_schedule->>'end_time';
    v_duration := (v_schedule->>'duration_minutes')::int;
    v_stage_order := (v_schedule->>'stage_order')::int;
    v_max_parts := (v_schedule->>'max_participants')::int;
    v_status := COALESCE(v_schedule->>'status', 'scheduled');

    -- Validate Item Code & Category (festival-scoped)
    SELECT id, item_name_en, category_codes INTO v_item_id, v_db_item_name, v_item_categories
    FROM public.items
    WHERE festival_id = p_festival_id AND item_code = v_item_code AND is_active = true
    LIMIT 1;

    IF v_item_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'error', 'Item code not found in active festival items'
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Validate Item Name matches exactly (English)
    IF LOWER(TRIM(v_db_item_name)) <> LOWER(TRIM(v_item_name)) THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'error', 'Item name mismatch. DB expects: ' || v_db_item_name
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Validate Category matches
    IF NOT (v_category = ANY(v_item_categories) OR v_category = 'GENERAL' OR 'GN' = ANY(v_item_categories)) THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'error', 'Category mismatch. Item expects: ' || array_to_string(v_item_categories, ', ')
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Validate Venue (belongs to permitted festival/tenant)
    SELECT id INTO v_venue_id
    FROM public.venues
    WHERE festival_id = p_festival_id AND tenant_id = p_tenant_id
      AND LOWER(TRIM(name)) = LOWER(TRIM(v_venue_name))
    LIMIT 1;

    IF v_venue_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'venue', v_venue_name,
        'error', 'Venue not found in active festival. Please create venue first.'
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Parse timestamps safely
    BEGIN
      v_start_time := to_timestamp(v_date || ' ' || v_start_str, 'YYYY-MM-DD HH:12:MI AM');
      v_end_time := to_timestamp(v_date || ' ' || v_end_str, 'YYYY-MM-DD HH:12:MI AM');
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'error', 'Invalid date or time format. Expected YYYY-MM-DD and HH:MM AM/PM'
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END;

    -- Check database overlaps/conflicts (same venue + overlapping time range)
    SELECT i.item_name_en INTO v_db_overlap_item
    FROM public.schedules s
    JOIN public.items i ON i.id = s.item_id
    WHERE s.festival_id = p_festival_id
      AND s.venue_id = v_venue_id
      AND s.start_time < v_end_time
      AND s.end_time > v_start_time
      AND s.item_id <> v_item_id -- exclude same item reschedule if identical
    LIMIT 1;

    IF v_db_overlap_item IS NOT NULL THEN
      v_conflicts := v_conflicts || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'venue', v_venue_name,
        'conflict_with', v_db_overlap_item,
        'start_time', v_start_str,
        'end_time', v_end_str,
        'error', 'Overlap detected with already scheduled item: ' || v_db_overlap_item
      );
      v_conflict_count := v_conflict_count + 1;
      CONTINUE; -- Block conflicting row
    END IF;

    -- Safe Insert schedule slot
    INSERT INTO public.schedules (
      tenant_id, festival_id, item_id, venue_id, start_time, end_time, status
    ) VALUES (
      p_tenant_id, p_festival_id, v_item_id, v_venue_id, v_start_time, v_end_time, v_status
    )
    ON CONFLICT (festival_id, venue_id, item_id, start_time, end_time) DO NOTHING;

    IF FOUND THEN
      v_imported_count := v_imported_count + 1;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'imported_count', v_imported_count,
    'skipped_count', v_skipped_count,
    'conflict_count', v_conflict_count,
    'invalid_count', v_invalid_count,
    'errors', v_errors,
    'conflicts', v_conflicts
  );
END;
$$;


ALTER FUNCTION "public"."execute_schedule_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_schedules" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_senior_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_items jsonb;
  v_item_code text;
  v_participant_id uuid;
  v_existing_name text;
  v_item_id uuid;
  v_festival_level text;

  v_imported_parts int := 0;
  v_skipped_parts int := 0;
  v_imported_regs int := 0;
  v_skipped_regs int := 0;

  v_invalid_items jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- 1. Scoped Advisory Lock
  -- Lock to prevent concurrent imports on the same festival
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text));

  -- 2. Detect Festival Level
  SELECT COALESCE(level, 'sector') INTO v_festival_level
  FROM public.festival_calendar
  WHERE id = p_festival_id
  LIMIT 1;

  -- Ensure session is valid AND scoped to the target tenant/festival
  IF p_session_id IS NOT NULL THEN
    UPDATE public.import_sessions
    SET status = 'processing'
    WHERE id = p_session_id AND status = 'pending'
      AND tenant_id = p_tenant_id AND festival_id = p_festival_id;
  END IF;

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := v_participant->>'chest_number';
    v_name := v_participant->>'name';
    v_items := v_participant->'items';

    -- Clean name format: spaces normalized, full caps (though frontend does it too)
    v_name := UPPER(TRIM(REGEXP_REPLACE(v_name, '\s+', ' ', 'g')));

    -- Check if participant exists with this chest number (scoped to permitted tenant/festival)
    SELECT id, name INTO v_participant_id, v_existing_name
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      -- Existing participant
      IF UPPER(TRIM(REGEXP_REPLACE(v_existing_name, '\s+', ' ', 'g'))) <> v_name THEN
        -- CRITICAL: Name mismatch for the same chest number
        v_errors := v_errors || jsonb_build_object(
          'chest_number', v_chest,
          'error', 'Name mismatch for existing chest number',
          'existing_name', v_existing_name,
          'import_name', v_name
        );
        v_skipped_parts := v_skipped_parts + 1;
        CONTINUE; -- Skip this participant completely to prevent corrupting existing records
      ELSE
        -- Idempotent skip: same participant, just make sure they exist
        v_skipped_parts := v_skipped_parts + 1;
      END IF;
    ELSE
      -- Create new participant with SENIOR category
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'SENIOR', 'approved'
      ) RETURNING id INTO v_participant_id;

      v_imported_parts := v_imported_parts + 1;
    END IF;

    -- Process Items safely
    FOR v_item_code IN SELECT * FROM jsonb_array_elements_text(v_items)
    LOOP
      -- Check if item is valid, belongs to the festival, and is in SR/SENIOR or GN category
      SELECT id INTO v_item_id
      FROM public.items
      WHERE festival_id = p_festival_id
        AND item_code = v_item_code
        AND (
          'SENIOR' = ANY(category_codes) OR
          'SR' = ANY(category_codes) OR
          'GN' = ANY(category_codes)
        )
      LIMIT 1;

      IF v_item_id IS NOT NULL THEN
        -- Safely insert registration with the dynamically detected festival level
        INSERT INTO public.registrations (
          tenant_id, festival_id, participant_id, item_id, status, level
        ) VALUES (
          p_tenant_id, p_festival_id, v_participant_id, v_item_id, 'approved', v_festival_level
        )
        ON CONFLICT (participant_id, item_id, festival_id) DO NOTHING;

        IF FOUND THEN
          v_imported_regs := v_imported_regs + 1;
        ELSE
          v_skipped_regs := v_skipped_regs + 1;
        END IF;
      ELSE
        -- Log invalid items but DO NOT skip the whole participant (Partial-Safe Import)
        v_invalid_items := v_invalid_items || jsonb_build_object(
          'chest_number', v_chest,
          'item_code', v_item_code,
          'error', 'Item not found or not in SENIOR/General category'
        );
      END IF;
    END LOOP;

  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_parts,
    'skipped_participants', v_skipped_parts,
    'imported_registrations', v_imported_regs,
    'skipped_registrations', v_skipped_regs,
    'invalid_items', v_invalid_items,
    'errors', v_errors,
    'warnings', v_warnings
  );
END;
$$;


ALTER FUNCTION "public"."execute_senior_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_upper_primary_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_items jsonb;
  v_item_code text;
  v_participant_id uuid;
  v_existing_name text;
  v_existing_gender text;
  v_item_id uuid;
  v_festival_level text;
  v_detected_gender text;

  v_imported_parts int := 0;
  v_skipped_parts int := 0;
  v_imported_regs int := 0;
  v_skipped_regs int := 0;

  v_invalid_items jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- 1. Scoped Advisory Lock
  -- Lock to prevent concurrent imports on the same festival
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text));

  -- 2. Detect Festival Level
  SELECT COALESCE(level, 'sector') INTO v_festival_level
  FROM public.festival_calendar
  WHERE id = p_festival_id
  LIMIT 1;

  -- Ensure session is valid AND scoped to the target tenant/festival
  IF p_session_id IS NOT NULL THEN
    UPDATE public.import_sessions
    SET status = 'processing'
    WHERE id = p_session_id AND status = 'pending'
      AND tenant_id = p_tenant_id AND festival_id = p_festival_id;
  END IF;

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := v_participant->>'chest_number';
    v_name := v_participant->>'name';
    v_items := v_participant->'items';

    -- Clean name format: spaces normalized, full caps
    v_name := UPPER(TRIM(REGEXP_REPLACE(v_name, '\s+', ' ', 'g')));

    -- Detect gender from items
    v_detected_gender := NULL;
    FOR v_item_code IN SELECT * FROM jsonb_array_elements_text(v_items)
    LOOP
      IF v_item_code IN ('UP-012', 'UP-013', 'UP-014', 'UP-015', 'UP-016') THEN
        v_detected_gender := 'Girls';
        EXIT;
      END IF;
    END LOOP;

    -- Check if participant exists with this chest number (scoped to permitted tenant/festival)
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      -- Existing participant
      IF UPPER(TRIM(REGEXP_REPLACE(v_existing_name, '\s+', ' ', 'g'))) <> v_name THEN
        -- CRITICAL: Name mismatch for the same chest number
        v_errors := v_errors || jsonb_build_object(
          'chest_number', v_chest,
          'error', 'Name mismatch for existing chest number',
          'existing_name', v_existing_name,
          'import_name', v_name
        );
        v_skipped_parts := v_skipped_parts + 1;
        CONTINUE; -- Skip this participant completely to prevent corrupting existing records
      ELSE
        -- Same participant, check Gender Conflict or Auto-assign if missing
        v_skipped_parts := v_skipped_parts + 1;

        IF v_detected_gender = 'Girls' THEN
          IF v_existing_gender IS NULL OR TRIM(v_existing_gender) = '' THEN
            UPDATE public.participants SET gender = 'Girls' WHERE id = v_participant_id;
            v_warnings := v_warnings || jsonb_build_object(
              'chest_number', v_chest,
              'warning', 'Girls Auto Assigned to existing participant'
            );
          ELSIF v_existing_gender = 'Boys' THEN
             v_warnings := v_warnings || jsonb_build_object(
              'chest_number', v_chest,
              'warning', 'Gender Conflict: Participant is Boys but registered in Girls-only event'
            );
          END IF;
        END IF;
      END IF;
    ELSE
      -- Create new participant with UP category
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, gender, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'UP', v_detected_gender, 'approved'
      ) RETURNING id INTO v_participant_id;

      IF v_detected_gender = 'Girls' THEN
        v_warnings := v_warnings || jsonb_build_object(
          'chest_number', v_chest,
          'warning', 'Girls Auto Assigned during creation'
        );
      END IF;

      v_imported_parts := v_imported_parts + 1;
    END IF;

    -- Process Items safely
    FOR v_item_code IN SELECT * FROM jsonb_array_elements_text(v_items)
    LOOP
      -- Check if item is valid, belongs to the festival, and is in UP/UPPER PRIMARY or GN category
      SELECT id INTO v_item_id
      FROM public.items
      WHERE festival_id = p_festival_id
        AND item_code = v_item_code
        AND (
          'UPPER PRIMARY' = ANY(category_codes) OR
          'UP' = ANY(category_codes) OR
          'GN' = ANY(category_codes)
        )
      LIMIT 1;

      IF v_item_id IS NOT NULL THEN
        -- Safely insert registration with the dynamically detected festival level
        INSERT INTO public.registrations (
          tenant_id, festival_id, participant_id, item_id, status, level
        ) VALUES (
          p_tenant_id, p_festival_id, v_participant_id, v_item_id, 'approved', v_festival_level
        )
        ON CONFLICT (participant_id, item_id, festival_id) DO NOTHING;

        IF FOUND THEN
          v_imported_regs := v_imported_regs + 1;
        ELSE
          v_skipped_regs := v_skipped_regs + 1;
        END IF;
      ELSE
        -- Log invalid items but DO NOT skip the whole participant (Partial-Safe Import)
        v_invalid_items := v_invalid_items || jsonb_build_object(
          'chest_number', v_chest,
          'item_code', v_item_code,
          'error', 'Item not found or not in UPPER PRIMARY/General category'
        );
      END IF;
    END LOOP;

  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_parts,
    'skipped_participants', v_skipped_parts,
    'imported_registrations', v_imported_regs,
    'skipped_registrations', v_skipped_regs,
    'invalid_items', v_invalid_items,
    'errors', v_errors,
    'warnings', v_warnings
  );
END;
$$;


ALTER FUNCTION "public"."execute_upper_primary_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_judge_token"("p_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  UPDATE public.judge_tokens jt
  SET is_used = true,
      used_at = now(),
      status = 'used'
  WHERE (
      jt.token_hash = encode(
        extensions.digest(upper(trim(p_token)), 'sha256'),
        'hex'
      )
      OR jt.token = upper(trim(p_token))
    )
    AND jt.is_used = false
    AND jt.is_revoked IS NOT TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or inactive judge token.';
  END IF;
END;
$$;


ALTER FUNCTION "public"."expire_judge_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalise_child_organisation_provisioning"("p_parent_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_op_id uuid;
  v_op jsonb;
  v_db_op public.tenant_provisioning_operations;
  v_parent_tenant uuid;
  v_parent_tenant_disabled boolean;
  v_new_tenant_id uuid;
  v_new_org_id uuid;
  v_parent jsonb;
  v_parent_archived timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    -- Lock operation
    SELECT * INTO v_db_op
    FROM public.tenant_provisioning_operations
    WHERE operation_type = 'child_organisation' AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      -- Enforce ownership
      IF v_db_op.requested_by <> v_uid AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Permission denied: operation belongs to another user';
      END IF;

      IF v_db_op.status = 'completed' THEN
        RETURN jsonb_build_object(
          'success', true,
          'operation_id', v_db_op.id,
          'status', 'completed',
          'tenant_id', v_db_op.target_tenant_id,
          'org_id', v_db_op.target_organisation_id,
          'parent_id', p_parent_id,
          'target_user_id', v_db_op.target_user_id,
          'message', 'Already completed'
        );
      END IF;

      -- Enforce immutable target_user_id if already set
      IF v_db_op.target_user_id IS NOT NULL AND v_db_op.target_user_id <> p_user_id THEN
        RAISE EXCEPTION 'Operation target user ID cannot change';
      END IF;
    END IF;
  END IF;

  v_op := public._provisioning_get_op('child_organisation', p_idempotency_key);
  IF v_op IS NOT NULL AND (v_op->>'target_tenant_id') IS NOT NULL THEN
    v_new_tenant_id := (v_op->>'target_tenant_id')::uuid;
  END IF;
  IF v_op IS NOT NULL AND (v_op->>'target_organisation_id') IS NOT NULL THEN
    v_new_org_id := (v_op->>'target_organisation_id')::uuid;
  END IF;

  v_parent := public._provisioning_get_org(p_parent_id);
  v_parent_tenant := (v_parent->>'tenant_id')::uuid;

  -- Check parent is not archived
  SELECT archived_at INTO v_parent_archived
  FROM public.organisations WHERE id = p_parent_id;
  IF v_parent_archived IS NOT NULL THEN
    RAISE EXCEPTION 'Permission denied: parent organisation is archived';
  END IF;

  -- Hierarchy + tenant-enabled authorization (superadmin bypasses).
  IF NOT public.is_superadmin() THEN
    IF public.get_my_tenant_id() IS NULL THEN
      RAISE EXCEPTION 'Permission denied: tenant access required';
    END IF;
    IF NOT public.is_org_visible(p_parent_id) THEN
      RAISE EXCEPTION 'Permission denied: parent organisation is not within your hierarchy';
    END IF;
  END IF;

  IF v_parent_tenant IS NULL THEN
    RAISE EXCEPTION 'Parent organisation is not linked to a tenant';
  END IF;
  SELECT COALESCE(access_disabled, false) INTO v_parent_tenant_disabled
  FROM public.tenants WHERE id = v_parent_tenant;
  IF v_parent_tenant_disabled THEN
    RAISE EXCEPTION 'Permission denied: parent tenant access is disabled';
  END IF;

  IF v_new_org_id IS NULL AND EXISTS (
    SELECT 1 FROM public.organisations WHERE lower(admin_email) = lower(p_username)
  ) THEN
    RAISE EXCEPTION 'Username already in use';
  END IF;

  IF v_new_tenant_id IS NULL THEN
    -- Batch 2A change: inherit the parent tenant's festival template
    -- server-side. The parent tenant is guaranteed to exist (checked above)
    -- and its festival_template is NOT NULL; COALESCE is belt-and-braces.
    INSERT INTO public.tenants (name, org_type, subscription_status, festival_template)
    SELECT p_org_name, p_org_type, 'active',
           COALESCE(parent_t.festival_template, 'sahithyolsav')
    FROM public.tenants parent_t
    WHERE parent_t.id = v_parent_tenant
    RETURNING id INTO v_new_tenant_id;
  END IF;

  IF v_new_org_id IS NULL THEN
    INSERT INTO public.organisations (tenant_id, name, org_type, parent_id, admin_email)
    VALUES (v_new_tenant_id, p_org_name, p_org_type, p_parent_id, p_username)
    RETURNING id INTO v_new_org_id;
    UPDATE public.tenants SET organisation_id = v_new_org_id
      WHERE id = v_new_tenant_id;
  END IF;

  PERFORM public._provisioning_link_profile(p_user_id, v_new_tenant_id, p_org_name || ' Admin');

  v_op_id := public._provisioning_upsert_op(
    'child_organisation', p_idempotency_key, 'completed', v_uid,
    v_new_org_id, v_new_tenant_id, p_user_id, p_username
  );

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    v_uid,
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_new_tenant_id, v_new_org_id,
    'child_organisation_provisioned', 'Child organisation provisioning finalised',
    jsonb_build_object('tenant_id', NULL, 'org_id', NULL),
    jsonb_build_object('tenant_id', v_new_tenant_id, 'org_id', v_new_org_id,
                       'parent_id', p_parent_id, 'target_user_id', p_user_id),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'status', 'completed',
    'tenant_id', v_new_tenant_id,
    'org_id', v_new_org_id,
    'parent_id', p_parent_id,
    'target_user_id', p_user_id,
    'message', 'Child organisation provisioning completed'
  );
EXCEPTION WHEN OTHERS THEN
  IF p_idempotency_key IS NOT NULL AND v_op_id IS NULL THEN
    BEGIN
      PERFORM public._provisioning_upsert_op(
        'child_organisation', p_idempotency_key, 'failed', v_uid,
        v_new_org_id, v_new_tenant_id, p_user_id, p_username, SQLSTATE
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RAISE;
END;
$$;


ALTER FUNCTION "public"."finalise_child_organisation_provisioning"("p_parent_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalise_team_leader_provisioning"("p_participant_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_participant public.participants;
  v_existing_profile public.profiles;
  v_caller_profile public.profiles;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_caller_profile
  FROM public.profiles
  WHERE id = v_caller;

  IF v_caller_profile.id IS NULL
     OR (v_caller_profile.role IS DISTINCT FROM 'admin' AND v_caller_profile.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only an authorized administrator may provision Team Leader accounts.';
  END IF;

  IF p_participant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Participant and user are required.';
  END IF;

  SELECT * INTO v_participant
  FROM public.participants
  WHERE id = p_participant_id;

  IF v_participant.id IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  IF v_participant.user_id IS NOT NULL AND v_participant.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Participant already has a linked account.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR public.is_org_visible(v_participant.organisation_id)
    OR public.get_my_tenant_id() IS NOT DISTINCT FROM v_participant.tenant_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Caller does not have management access to this participant';
  END IF;

  SELECT * INTO v_existing_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_existing_profile.id IS NOT NULL THEN
    IF v_existing_profile.role NOT IN ('participant', 'team_leader') THEN
      RAISE EXCEPTION 'Role Conflict: The associated account cannot be converted to Team Leader.';
    END IF;
    IF v_existing_profile.role = 'participant' THEN
      UPDATE public.profiles
      SET role = 'team_leader'
      WHERE id = p_user_id;
    END IF;
  ELSE
    INSERT INTO public.profiles (id, tenant_id, role, full_name)
    VALUES (p_user_id, v_participant.tenant_id, 'team_leader', v_participant.name);
  END IF;

  UPDATE public.participants
  SET user_id = p_user_id
  WHERE id = p_participant_id
    AND (user_id IS NULL OR user_id = p_user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant link could not be completed.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'participant_id', p_participant_id,
    'user_id', p_user_id
  );
END;
$$;


ALTER FUNCTION "public"."finalise_team_leader_provisioning"("p_participant_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalise_tenant_provisioning"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_op_id uuid;
  v_op jsonb;
  v_db_op public.tenant_provisioning_operations;
  v_tenant_id uuid;
  v_existing_tenant uuid;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmin can finalise a root tenant';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_db_op
    FROM public.tenant_provisioning_operations
    WHERE operation_type = 'root_tenant' AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      -- Enforce ownership
      IF v_db_op.requested_by <> v_uid AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Permission denied: operation belongs to another user';
      END IF;
      
      IF v_db_op.status = 'completed' THEN
        RETURN jsonb_build_object(
          'success', true,
          'operation_id', v_db_op.id,
          'status', 'completed',
          'tenant_id', v_db_op.target_tenant_id,
          'org_id', p_org_id,
          'target_user_id', v_db_op.target_user_id,
          'message', 'Already completed'
        );
      END IF;

      IF v_db_op.target_user_id IS NOT NULL AND v_db_op.target_user_id <> p_user_id THEN
        RAISE EXCEPTION 'Operation target user ID cannot change';
      END IF;
    END IF;
  END IF;

  v_op := public._provisioning_get_op('root_tenant', p_idempotency_key);
  IF v_op IS NOT NULL AND (v_op->>'target_tenant_id') IS NOT NULL THEN
    v_tenant_id := (v_op->>'target_tenant_id')::uuid;
  END IF;

  SELECT tenant_id INTO v_existing_tenant FROM public.organisations WHERE id = p_org_id;
  
  IF v_tenant_id IS NULL THEN
    IF v_existing_tenant IS NOT NULL THEN
      v_tenant_id := v_existing_tenant;
    ELSE
      INSERT INTO public.tenants (name, org_type, organisation_id, subscription_status)
      VALUES (p_org_name, p_org_type, p_org_id, 'active')
      RETURNING id INTO v_tenant_id;
    END IF;
  END IF;

  IF v_existing_tenant IS NULL THEN
    UPDATE public.organisations SET tenant_id = v_tenant_id WHERE id = p_org_id;
  END IF;

  PERFORM public._provisioning_link_profile(p_user_id, v_tenant_id, p_org_name || ' Admin');

  v_op_id := public._provisioning_upsert_op(
    'root_tenant', p_idempotency_key, 'completed', v_uid,
    p_org_id, v_tenant_id, p_user_id, NULL
  );

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    v_uid, 'superadmin', v_tenant_id, p_org_id,
    'root_tenant_provisioned', 'Root tenant provisioning finalised',
    jsonb_build_object('tenant_id', NULL),
    jsonb_build_object('tenant_id', v_tenant_id, 'target_user_id', p_user_id),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'status', 'completed',
    'tenant_id', v_tenant_id,
    'org_id', p_org_id,
    'target_user_id', p_user_id,
    'message', 'Root tenant provisioning completed'
  );
EXCEPTION WHEN OTHERS THEN
  IF p_idempotency_key IS NOT NULL AND v_op_id IS NULL THEN
    BEGIN
      PERFORM public._provisioning_upsert_op(
        'root_tenant', p_idempotency_key, 'failed', v_uid,
        p_org_id, v_tenant_id, p_user_id, NULL, SQLSTATE
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RAISE;
END;
$$;


ALTER FUNCTION "public"."finalise_tenant_provisioning"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalise_tenant_provisioning"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_idempotency_key" "text", "p_festival_template" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb;
  v_tenant_id uuid;
  v_dependent_exists boolean;
BEGIN
  IF p_festival_template NOT IN ('sahithyolsav', 'college_fest') THEN
    RAISE EXCEPTION 'Invalid festival_template: %', p_festival_template;
  END IF;

  v_result := public.finalise_tenant_provisioning(
    p_org_id,
    p_user_id,
    p_org_name,
    p_org_type,
    p_idempotency_key
  );

  v_tenant_id := (v_result->>'tenant_id')::uuid;

  -- Retry guard: an already-completed provisioning must not silently move a
  -- tenant to a different template once festival data exists.
  IF v_result->>'message' = 'Already completed' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.festival_calendar WHERE tenant_id = v_tenant_id
    ) INTO v_dependent_exists;

    IF v_dependent_exists THEN
      RAISE EXCEPTION 'Cannot change festival template: festival data already exists for tenant %', v_tenant_id;
    END IF;
  END IF;

  UPDATE public.tenants
     SET festival_template = p_festival_template
   WHERE id = v_tenant_id;

  RETURN v_result || jsonb_build_object('festival_template', p_festival_template);
END;
$$;


ALTER FUNCTION "public"."finalise_tenant_provisioning"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_idempotency_key" "text", "p_festival_template" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_judge_token"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_force_refresh" boolean DEFAULT false) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_token text;
  v_token_hash text;
  v_existing_token text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = p_schedule_id
      AND a.judge_id = p_judge_id
      AND a.tenant_id = p_tenant_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Assign this judge to the event before generating an access code.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR p_tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to generate this code.';
  END IF;

  IF NOT p_force_refresh THEN
    SELECT jt.token
    INTO v_existing_token
    FROM public.judge_tokens jt
    WHERE jt.judge_id = p_judge_id
      AND jt.schedule_id = p_schedule_id
      AND jt.tenant_id = p_tenant_id
      AND jt.is_used = false
      AND jt.is_revoked IS NOT TRUE
      AND (jt.expires_at IS NULL OR jt.expires_at > now())
    ORDER BY jt.created_at DESC
    LIMIT 1;

    IF v_existing_token IS NOT NULL THEN
      RETURN v_existing_token;
    END IF;
  ELSE
    UPDATE public.judge_tokens
    SET is_revoked = true,
        revoked_at = now(),
        revoked_by = COALESCE(p_created_by, auth.uid()),
        revocation_reason = 'Regenerated by administrator',
        status = CASE
          WHEN status IN ('created', 'pending_approval', 'approved') THEN 'rejected'
          ELSE status
        END
    WHERE judge_id = p_judge_id
      AND schedule_id = p_schedule_id
      AND tenant_id = p_tenant_id
      AND is_used = false
      AND is_revoked IS NOT TRUE;
  END IF;

  LOOP
    v_token := upper(encode(extensions.gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.judge_tokens WHERE token = v_token
    );
  END LOOP;

  v_token_hash := encode(
    extensions.digest(upper(trim(v_token)), 'sha256'),
    'hex'
  );

  INSERT INTO public.judge_tokens (
    judge_id,
    schedule_id,
    tenant_id,
    created_by,
    token,
    token_hash,
    created_at,
    is_used,
    is_revoked,
    status
  ) VALUES (
    p_judge_id,
    p_schedule_id,
    p_tenant_id,
    COALESCE(p_created_by, auth.uid()),
    v_token,
    v_token_hash,
    now(),
    false,
    false,
    'created'
  );

  RETURN v_token;
END;
$$;


ALTER FUNCTION "public"."generate_judge_token"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid", "p_force_refresh" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_judge_token"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid", "p_force_refresh" boolean) IS 'Canonical judge token generator from migration 083; supersedes both historical 082 definitions.';



CREATE OR REPLACE FUNCTION "public"."get_admin_leaderboard"("p_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("organisation_id" "uuid", "organisation_name" "text", "organisation_type" "text", "parent_id" "uuid", "total_points" bigint, "first_place_count" bigint, "second_place_count" bigint, "third_place_count" bigint, "grade_a_plus_count" bigint, "grade_a_count" bigint, "grade_b_count" bigint, "grade_c_count" bigint, "result_count" bigint, "latest_published_at" timestamp with time zone, "grace_marks_awarded" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_festival_id uuid;
  v_caller_is_admin boolean := false;
  v_festival_tenant_id uuid;
  v_enable_grace_marks boolean := false;
BEGIN
  SELECT (p_tenant_id IS NOT NULL OR p_festival_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC, start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  SELECT fc.tenant_id INTO v_festival_tenant_id
  FROM festival_calendar fc
  WHERE fc.id = v_festival_id;

  -- Check if grace marks are enabled
  SELECT COALESCE(enable_grace_marks, false) INTO v_enable_grace_marks
  FROM points_config
  WHERE festival_id = v_festival_id
  ORDER BY config_version DESC
  LIMIT 1;

  RETURN QUERY
  WITH deduped_results AS (
    SELECT DISTINCT ON (COALESCE(res.registration_id, res.id), res.item_id)
      res.id AS result_id,
      res.points_awarded,
      res.rank,
      res.grade,
      res.published_at,
      res.registration_id,
      res.festival_id
    FROM results res
    LEFT JOIN registrations reg ON reg.id = res.registration_id
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'draft') = 'published'
      AND reg.status IS DISTINCT FROM 'rejected'
    ORDER BY COALESCE(res.registration_id, res.id), res.item_id,
             res.published_at DESC NULLS LAST, res.id DESC
  )
  SELECT
    org.id AS organisation_id,
    COALESCE(org.name, 'Unassigned') AS organisation_name,
    org.org_type AS organisation_type,
    org.parent_id AS parent_id,
    COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0)::bigint + 
      (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS total_points,
    COUNT(*) FILTER (WHERE res.rank = 1)::bigint AS first_place_count,
    COUNT(*) FILTER (WHERE res.rank = 2)::bigint AS second_place_count,
    COUNT(*) FILTER (WHERE res.rank = 3)::bigint AS third_place_count,
    COUNT(*) FILTER (WHERE res.grade = 'A+')::bigint AS grade_a_plus_count,
    COUNT(*) FILTER (WHERE res.grade = 'A')::bigint AS grade_a_count,
    COUNT(*) FILTER (WHERE res.grade = 'B')::bigint AS grade_b_count,
    COUNT(*) FILTER (WHERE res.grade = 'C')::bigint AS grade_c_count,
    COUNT(*)::bigint AS result_count,
    MAX(res.published_at) AS latest_published_at,
    (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS grace_marks_awarded
  FROM deduped_results res
  JOIN festival_calendar festival ON festival.id = res.festival_id
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE org.id IS NOT NULL
    AND (
      org.tenant_id = v_festival_tenant_id
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
      )
      OR org.tenant_id IN (
        SELECT DISTINCT o2.tenant_id
        FROM organisations o2
        WHERE o2.parent_id IN (
          SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
        )
      )
    )
  GROUP BY org.id, org.name, org.org_type, org.parent_id
  ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC,
           organisation_name ASC;
END;
$$;


ALTER FUNCTION "public"."get_admin_leaderboard"("p_tenant_id" "uuid", "p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_published_results"("p_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("result_id" "uuid", "registration_id" "uuid", "schedule_id" "uuid", "item_id" "uuid", "item_name" "text", "item_name_ml" "text", "is_group" boolean, "organisation_id" "uuid", "organisation_name" "text", "participant_id" "uuid", "participant_name" "text", "chest_number" "text", "rank" integer, "grade" "text", "points_awarded" integer, "total_score" numeric, "published" boolean, "result_status" "text", "public_visible" boolean, "collection_method" "text", "published_at" timestamp with time zone, "festival_id" "uuid", "tenant_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_festival_id uuid;
  v_festival_tenant_id uuid;
  v_caller_is_admin boolean := false;
BEGIN
  SELECT (p_tenant_id IS NOT NULL OR p_festival_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT fc.id INTO v_festival_id
    FROM festival_calendar fc
    WHERE fc.is_active IS TRUE
      AND (p_tenant_id IS NULL OR fc.tenant_id = p_tenant_id)
    ORDER BY fc.festival_year DESC, fc.start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  SELECT fc.tenant_id INTO v_festival_tenant_id
  FROM festival_calendar fc
  WHERE fc.id = v_festival_id;

  RETURN QUERY
  SELECT
    res.id AS result_id,
    res.registration_id AS registration_id,
    sch.id AS schedule_id,
    res.item_id AS item_id,
    COALESCE(itm.item_name_en, '') AS item_name,
    COALESCE(itm.item_name_ml, '') AS item_name_ml,
    COALESCE(itm.participation_type = 'group', false) AS is_group,
    org.id AS organisation_id,
    COALESCE(org.name, 'Unassigned') AS organisation_name,
    participant.id AS participant_id,
    COALESCE(participant.name, '') AS participant_name,
    COALESCE(participant.chest_number, '') AS chest_number,
    res.rank AS rank,
    res.grade AS grade,
    COALESCE(res.points_awarded, 0) AS points_awarded,
    res.total_score AS total_score,
    COALESCE(res.published, false) AS published,
    COALESCE(res.result_status, 'draft') AS result_status,
    COALESCE(res.public_visible, false) AS public_visible,
    res.collection_method AS collection_method,
    res.published_at AS published_at,
    res.festival_id AS festival_id,
    res.tenant_id AS tenant_id
  FROM results res
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN LATERAL (
    SELECT schedules.id
    FROM schedules
    WHERE schedules.item_id = res.item_id
      AND schedules.tenant_id = COALESCE(res.tenant_id, v_festival_tenant_id)
    ORDER BY schedules.start_time DESC NULLS LAST, schedules.id DESC
    LIMIT 1
  ) sch ON TRUE
  LEFT JOIN items itm ON itm.id = res.item_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE res.festival_id = v_festival_id
    AND res.published IS TRUE
    AND COALESCE(res.result_status, 'draft') = 'published'
  ORDER BY
    res.published_at DESC NULLS LAST,
    COALESCE(itm.item_name_ml, itm.item_name_en, ''),
    res.rank NULLS LAST,
    res.id DESC;
END;
$$;


ALTER FUNCTION "public"."get_admin_published_results"("p_tenant_id" "uuid", "p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_festival_results"("p_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("result_id" "uuid", "registration_id" "uuid", "schedule_id" "uuid", "item_id" "uuid", "item_name" "text", "item_name_ml" "text", "is_group" boolean, "organisation_id" "uuid", "organisation_name" "text", "participant_id" "uuid", "participant_name" "text", "chest_number" "text", "rank" integer, "grade" "text", "points_awarded" integer, "total_score" numeric, "published" boolean, "result_status" "text", "public_visible" boolean, "collection_method" "text", "published_at" timestamp with time zone, "festival_id" "uuid", "tenant_id" "uuid", "public_result_no" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_is_admin boolean;
  v_resolved_festival_id uuid;
BEGIN
  -- 1. Verify caller is an admin
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  -- 2. Verify tenant access: caller must match the requested tenant or be superadmin
  IF p_tenant_id IS NOT NULL AND NOT public.verify_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Unauthorized: you cannot access results for this tenant';
  END IF;

  -- 3. Resolve festival_id if not provided
  IF p_festival_id IS NOT NULL THEN
    v_resolved_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_resolved_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC, start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_resolved_festival_id IS NULL THEN
    RETURN;
  END IF;

  -- 4. Execute query with parent-child tenant support
  RETURN QUERY
  SELECT
    res.id AS result_id,
    res.registration_id AS registration_id,
    sch.id AS schedule_id,
    res.item_id AS item_id,
    COALESCE(itm.item_name_en, '') AS item_name,
    COALESCE(itm.item_name_ml, '') AS item_name_ml,
    COALESCE(itm.participation_type = 'group', false) AS is_group,
    org.id AS organisation_id,
    COALESCE(org.name, 'Unassigned') AS organisation_name,
    participant.id AS participant_id,
    CASE
      WHEN COALESCE(res.result_status, 'draft') = 'published'
        THEN COALESCE(participant.name, '')
      ELSE ''
    END AS participant_name,
    COALESCE(participant.chest_number, '') AS chest_number,
    res.rank AS rank,
    res.grade AS grade,
    COALESCE(res.points_awarded, 0) AS points_awarded,
    res.total_score AS total_score,
    COALESCE(res.published, false) AS published,
    COALESCE(res.result_status, 'draft') AS result_status,
    COALESCE(res.public_visible, false) AS public_visible,
    res.collection_method AS collection_method,
    res.published_at AS published_at,
    res.festival_id AS festival_id,
    res.tenant_id AS tenant_id,
    res.public_result_no AS public_result_no
  FROM results res
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN schedules sch
    ON sch.item_id = res.item_id
   AND sch.tenant_id = res.tenant_id
  LEFT JOIN items itm ON itm.id = res.item_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE res.festival_id = v_resolved_festival_id
    AND (
      p_tenant_id IS NULL
      OR res.tenant_id = p_tenant_id
      OR org.tenant_id = p_tenant_id
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id = p_tenant_id
      )
    )
    AND reg.status IS DISTINCT FROM 'rejected'
  ORDER BY
    CASE COALESCE(res.result_status, 'draft')
      WHEN 'published' THEN 1
      WHEN 'ready'     THEN 2
      WHEN 'draft'     THEN 3
      WHEN 'hidden'    THEN 4
      WHEN 'archived'  THEN 5
    END,
    res.published_at DESC NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_festival_results"("p_tenant_id" "uuid", "p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_judge_login_status"("p_token" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_status text;
BEGIN
  SELECT CASE
    WHEN jt.is_used THEN 'used'
    WHEN jt.is_revoked IS TRUE THEN 'rejected'
    WHEN jt.expires_at IS NOT NULL AND jt.expires_at <= now() THEN 'expired'
    ELSE jt.status
  END
  INTO v_status
  FROM public.judge_tokens jt
  WHERE (
      jt.token_hash = encode(
        extensions.digest(upper(trim(p_token)), 'sha256'),
        'hex'
      )
      OR jt.token = upper(trim(p_token))
    )
  ORDER BY jt.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_status, 'invalid');
END;
$$;


ALTER FUNCTION "public"."get_judge_login_status"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_judge_management_status"("p_tenant_id" "uuid") RETURNS TABLE("schedule_id" "uuid", "expected_count" integer, "assigned_count" bigint, "eligible_registration_count" bigint, "completed_judge_count" bigint, "marks_completed" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH schedule_base AS (
    SELECT s.id, s.item_id, s.expected_judge_count, s.status
    FROM public.schedules s
    WHERE s.tenant_id = p_tenant_id
      AND (
        s.tenant_id = public.get_my_tenant_id()
        OR public.is_superadmin()
      )
  ),
  eligible_registrations AS (
    SELECT
      sb.id AS schedule_id,
      r.id AS registration_id
    FROM schedule_base sb
    JOIN public.registrations r
      ON r.item_id = sb.item_id
     AND r.status IS DISTINCT FROM 'rejected'
     AND r.code_letter IS NOT NULL
  ),
  eligible_regs AS (
    SELECT
      sb.id AS schedule_id,
      COUNT(er.registration_id)::bigint AS eligible_count
    FROM schedule_base sb
    LEFT JOIN eligible_registrations er ON er.schedule_id = sb.id
    GROUP BY sb.id
  ),
  active_assignments AS (
    SELECT a.schedule_id, a.judge_id
    FROM public.schedule_judge_assignments a
    WHERE a.tenant_id = p_tenant_id
      AND a.status = 'active'
  ),
  judge_completion AS (
    SELECT
      aa.schedule_id,
      aa.judge_id,
      COUNT(DISTINCT me.registration_id)
        FILTER (WHERE me.is_final = true)::bigint AS final_count
    FROM active_assignments aa
    LEFT JOIN public.mark_entries me
      ON me.schedule_id = aa.schedule_id
     AND me.judge_id = aa.judge_id
     AND me.registration_id IN (
       SELECT er.registration_id
       FROM eligible_registrations er
       WHERE er.schedule_id = aa.schedule_id
     )
    GROUP BY aa.schedule_id, aa.judge_id
  ),
  panel_counts AS (
    SELECT
      sb.id AS schedule_id,
      COUNT(DISTINCT aa.judge_id)::bigint AS assigned_count,
      COUNT(DISTINCT gc.judge_id)
        FILTER (WHERE gc.final_count >= er.eligible_count AND er.eligible_count > 0)::bigint
        AS completed_judge_count
    FROM schedule_base sb
    JOIN eligible_regs er ON er.schedule_id = sb.id
    LEFT JOIN active_assignments aa ON aa.schedule_id = sb.id
    LEFT JOIN judge_completion gc
      ON gc.schedule_id = aa.schedule_id
     AND gc.judge_id = aa.judge_id
    GROUP BY sb.id, er.eligible_count
  )
  SELECT
    sb.id AS schedule_id,
    sb.expected_judge_count AS expected_count,
    pc.assigned_count,
    er.eligible_count AS eligible_registration_count,
    pc.completed_judge_count,
    (
      sb.status IN ('completed', 'published')
      OR (
        er.eligible_count > 0
        AND pc.assigned_count = sb.expected_judge_count
        AND pc.completed_judge_count >= sb.expected_judge_count
      )
      OR EXISTS (
        SELECT 1
        FROM public.results res
        WHERE res.item_id = sb.item_id
          AND (
            res.published = true
            OR res.result_status = 'published'
          )
      )
    ) AS marks_completed
  FROM schedule_base sb
  JOIN eligible_regs er ON er.schedule_id = sb.id
  JOIN panel_counts pc ON pc.schedule_id = sb.id;
$$;


ALTER FUNCTION "public"."get_judge_management_status"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_judge_registrations"("p_token" "text") RETURNS TABLE("id" "uuid", "item_id" "uuid", "tenant_id" "uuid", "code_letter" "text", "participant_name" "text", "chest_number" "text", "photo_url" "text", "category_code" "text", "is_verified" boolean, "existing_mark" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
  v_schedule_tenant_id uuid;
  v_schedule_festival_id uuid;
  v_schedule_item_id uuid;
  v_root_org_id uuid;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN RAISE EXCEPTION 'Access code is required.'; END IF;
  SELECT jt.* INTO v_token FROM public.judge_tokens jt
  WHERE (jt.token_hash = encode(extensions.digest(upper(trim(p_token)), 'sha256'), 'hex')
      OR jt.token = upper(trim(p_token)))
    AND jt.status = 'approved' AND jt.is_used = false AND jt.is_revoked IS NOT TRUE
    AND (jt.expires_at IS NULL OR jt.expires_at > now())
  ORDER BY jt.created_at DESC LIMIT 1;
  IF v_token.id IS NULL THEN RAISE EXCEPTION 'Access code is invalid, awaiting approval, or expired.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_judge_assignments assignment
    WHERE assignment.schedule_id = v_token.schedule_id
      AND assignment.judge_id = v_token.judge_id
      AND assignment.tenant_id = v_token.tenant_id
      AND assignment.status = 'active'
  ) THEN RAISE EXCEPTION 'This judge is no longer assigned to the event.'; END IF;

  SELECT schedule.tenant_id, COALESCE(schedule.festival_id, item.festival_id), schedule.item_id
  INTO v_schedule_tenant_id, v_schedule_festival_id, v_schedule_item_id
  FROM public.schedules schedule
  LEFT JOIN public.items item ON item.id = schedule.item_id
  WHERE schedule.id = v_token.schedule_id;
  IF v_schedule_tenant_id IS NULL THEN RAISE EXCEPTION 'Event schedule was not found.'; END IF;
  IF v_schedule_festival_id IS NULL THEN RAISE EXCEPTION 'Event festival context was not found.'; END IF;
  SELECT tenant.organisation_id INTO v_root_org_id FROM public.tenants tenant WHERE tenant.id = v_schedule_tenant_id;

  RETURN QUERY
  WITH RECURSIVE organisation_tree AS (
    SELECT organisation.id FROM public.organisations organisation
    WHERE organisation.id = v_root_org_id
       OR (v_root_org_id IS NULL AND organisation.tenant_id = v_schedule_tenant_id)
    UNION
    SELECT child.id FROM public.organisations child
    INNER JOIN organisation_tree parent ON child.parent_id = parent.id
  )
  SELECT registration.id, registration.item_id, registration.tenant_id,
    registration.code_letter, participant.name, participant.chest_number,
    participant.photo_url, participant.category_code, registration.is_verified,
    mark.existing_mark
  FROM public.registrations registration
  LEFT JOIN public.participants participant ON participant.id = registration.participant_id
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id', mark_entry.id, 'criteria_scores', mark_entry.criteria_scores,
      'total_mark', mark_entry.total_mark, 'entry_mode_snapshot', mark_entry.entry_mode_snapshot,
      'max_mark_snapshot', mark_entry.max_mark_snapshot, 'criteria_snapshot', mark_entry.criteria_snapshot,
      'is_draft', mark_entry.is_draft, 'is_final', mark_entry.is_final
    ) AS existing_mark
    FROM public.mark_entries mark_entry
    WHERE mark_entry.schedule_id = v_token.schedule_id
      AND mark_entry.judge_id = v_token.judge_id
      AND mark_entry.registration_id = registration.id
    ORDER BY mark_entry.updated_at DESC NULLS LAST,
      mark_entry.submitted_at DESC NULLS LAST, mark_entry.id DESC LIMIT 1
  ) mark ON true
  WHERE registration.item_id = v_schedule_item_id
    AND registration.festival_id = v_schedule_festival_id
    AND registration.status IS DISTINCT FROM 'rejected'
    AND registration.code_letter IS NOT NULL
    AND (
      registration.organisation_id IN (SELECT organisation_tree.id FROM organisation_tree)
      OR participant.organisation_id IN (SELECT organisation_tree.id FROM organisation_tree)
      OR EXISTS (
        SELECT 1 FROM public.tenants registration_tenant
        WHERE registration_tenant.id = registration.tenant_id
          AND registration_tenant.organisation_id IN (SELECT organisation_tree.id FROM organisation_tree)
      )
    )
  ORDER BY registration.code_letter;
END;
$$;


ALTER FUNCTION "public"."get_judge_registrations"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_judge_registrations"("p_schedule_id" "uuid") RETURNS TABLE("id" "uuid", "item_id" "uuid", "tenant_id" "uuid", "code_letter" "text", "participant_name" "text", "chest_number" "text", "photo_url" "text", "category_code" "text", "is_verified" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_schedule_tenant_id uuid;
  v_schedule_festival_id uuid;
  v_schedule_item_id uuid;
  v_root_org_id uuid;
BEGIN
  IF p_schedule_id IS NULL THEN
    RAISE EXCEPTION 'Schedule id is required.';
  END IF;

  SELECT schedule.tenant_id, schedule.festival_id, schedule.item_id
  INTO v_schedule_tenant_id, v_schedule_festival_id, v_schedule_item_id
  FROM public.schedules schedule
  WHERE schedule.id = p_schedule_id;

  IF v_schedule_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Schedule was not found.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_schedule_tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to view this event.';
  END IF;

  SELECT tenant.organisation_id
  INTO v_root_org_id
  FROM public.tenants tenant
  WHERE tenant.id = v_schedule_tenant_id;

  RETURN QUERY
  WITH RECURSIVE organisation_tree AS (
    SELECT organisation.id
    FROM public.organisations organisation
    WHERE organisation.id = v_root_org_id
       OR (v_root_org_id IS NULL AND organisation.tenant_id = v_schedule_tenant_id)

    UNION

    SELECT child.id
    FROM public.organisations child
    INNER JOIN organisation_tree parent ON child.parent_id = parent.id
  )
  SELECT
    registration.id,
    registration.item_id,
    registration.tenant_id,
    registration.code_letter,
    participant.name AS participant_name,
    participant.chest_number,
    participant.photo_url,
    participant.category_code,
    registration.is_verified
  FROM public.registrations registration
  LEFT JOIN public.participants participant
    ON participant.id = registration.participant_id
  WHERE registration.item_id = v_schedule_item_id
    AND registration.festival_id = v_schedule_festival_id
    AND registration.status IS DISTINCT FROM 'rejected'
    AND registration.code_letter IS NOT NULL
    AND COALESCE(
      registration.organisation_id,
      participant.organisation_id
    ) IN (SELECT organisation_tree.id FROM organisation_tree)
  ORDER BY registration.code_letter;
END;
$$;


ALTER FUNCTION "public"."get_judge_registrations"("p_schedule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_judge_submission_summary"("p_schedule_id" "uuid") RETURNS TABLE("judge_id" "uuid", "judge_name" "text", "submitted_count" bigint, "draft_count" bigint, "total_assigned" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  WITH selected_schedule AS (
    SELECT s.id, s.item_id, s.festival_id, s.tenant_id
    FROM public.schedules s
    WHERE s.id = p_schedule_id
      AND (public.is_superadmin() OR s.tenant_id = public.get_my_tenant_id())
  ), eligible_regs AS (
    SELECT r.id
    FROM public.registrations r
    JOIN selected_schedule s
      ON r.item_id = s.item_id
     AND r.festival_id = s.festival_id
     AND r.tenant_id = s.tenant_id
    WHERE r.status IS DISTINCT FROM 'rejected'
      AND r.code_letter IS NOT NULL
  )
  SELECT j.id, j.name,
         COUNT(DISTINCT me.registration_id) FILTER (WHERE me.is_final = true),
         COUNT(DISTINCT me.registration_id) FILTER (WHERE me.is_draft = true),
         (SELECT COUNT(*) FROM eligible_regs)::bigint
  FROM public.schedule_judge_assignments a
  JOIN public.judges j ON j.id = a.judge_id
  LEFT JOIN public.mark_entries me
    ON me.judge_id = a.judge_id
   AND me.schedule_id = a.schedule_id
   AND me.registration_id IN (SELECT id FROM eligible_regs)
  JOIN selected_schedule s ON s.id = a.schedule_id
  WHERE a.schedule_id = p_schedule_id
    AND a.status = 'active'
    AND (public.is_superadmin() OR a.tenant_id = public.get_my_tenant_id())
  GROUP BY j.id, j.name;
$$;


ALTER FUNCTION "public"."get_judge_submission_summary"("p_schedule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_leaderboard_preview"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_ranking_mode" "text", "p_item_limit" integer, "p_use_public_only" boolean DEFAULT false) RETURNS TABLE("organisation_id" "uuid", "organisation_name" "text", "organisation_type" "text", "parent_id" "uuid", "total_points" bigint, "first_place_count" bigint, "second_place_count" bigint, "third_place_count" bigint, "grade_a_plus_count" bigint, "grade_a_count" bigint, "grade_b_count" bigint, "grade_c_count" bigint, "result_count" bigint, "latest_published_at" timestamp with time zone, "grace_marks_awarded" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_festival_id uuid;
  v_caller_is_admin boolean;
  v_festival_tenant_id uuid;
  v_enable_grace_marks boolean := false;
BEGIN
  -- 1. Resolve festival ID
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Get the festival's tenant_id
  SELECT tenant_id INTO v_festival_tenant_id
  FROM festival_calendar
  WHERE id = v_festival_id;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  -- Check if grace marks are enabled
  SELECT COALESCE(enable_grace_marks, false) INTO v_enable_grace_marks
  FROM points_config
  WHERE festival_id = v_festival_id
  ORDER BY config_version DESC
  LIMIT 1;

  -- 4. Execute query
  RETURN QUERY
  WITH limited_items AS (
    SELECT item_id
    FROM results
    WHERE festival_id = v_festival_id
      AND published IS TRUE
      AND (
        CASE WHEN p_use_public_only
          THEN COALESCE(result_status, 'published') = 'published'
          ELSE COALESCE(result_status, 'draft') IN ('published', 'ready')
        END
      )
      AND (NOT p_use_public_only OR COALESCE(public_visible, false) IS TRUE)
    GROUP BY item_id
    ORDER BY MIN(published_at) ASC, item_id ASC
    LIMIT (CASE WHEN COALESCE(p_ranking_mode, 'ALL') = 'LIMITED' AND p_item_limit IS NOT NULL AND p_item_limit > 0 THEN p_item_limit ELSE 999999 END)
  ),
  deduped_results AS (
    SELECT DISTINCT ON (COALESCE(res.registration_id, res.id), res.item_id)
      res.id           AS result_id,
      res.points_awarded,
      res.rank,
      res.grade,
      res.published_at,
      res.registration_id,
      res.festival_id
    FROM results res
    LEFT JOIN registrations reg ON reg.id = res.registration_id
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND (
        CASE WHEN p_use_public_only
          THEN COALESCE(res.result_status, 'published') = 'published'
          ELSE COALESCE(res.result_status, 'draft') IN ('published', 'ready')
        END
      )
      AND (NOT p_use_public_only OR COALESCE(res.public_visible, false) IS TRUE)
      AND reg.status IS DISTINCT FROM 'rejected'
      AND res.item_id IN (SELECT item_id FROM limited_items)
    ORDER BY COALESCE(res.registration_id, res.id), res.item_id,
             res.published_at DESC NULLS LAST, res.id DESC
  )
  SELECT
    org.id                                                        AS organisation_id,
    COALESCE(org.name, 'Unassigned')                              AS organisation_name,
    org.org_type                                                  AS organisation_type,
    org.parent_id                                                 AS parent_id,
    COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0)::bigint + 
      (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS total_points,
    COUNT(*) FILTER (WHERE res.rank = 1)::bigint                 AS first_place_count,
    COUNT(*) FILTER (WHERE res.rank = 2)::bigint                 AS second_place_count,
    COUNT(*) FILTER (WHERE res.rank = 3)::bigint                 AS third_place_count,
    COUNT(*) FILTER (WHERE res.grade = 'A+')::bigint             AS grade_a_plus_count,
    COUNT(*) FILTER (WHERE res.grade = 'A')::bigint              AS grade_a_count,
    COUNT(*) FILTER (WHERE res.grade = 'B')::bigint              AS grade_b_count,
    COUNT(*) FILTER (WHERE res.grade = 'C')::bigint              AS grade_c_count,
    COUNT(*)::bigint                                              AS result_count,
    MAX(res.published_at)                                         AS latest_published_at,
    (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS grace_marks_awarded
  FROM deduped_results res
  JOIN festival_calendar festival ON festival.id = res.festival_id
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE org.id IS NOT NULL
    AND (
      org.tenant_id = v_festival_tenant_id
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
      )
      OR org.tenant_id IN (
        SELECT DISTINCT o2.tenant_id
        FROM organisations o2
        WHERE o2.id = org.parent_id AND o2.tenant_id = v_festival_tenant_id
      )
    )
  GROUP BY org.id
  HAVING COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0) > 0 OR COUNT(*) > 0
  ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC, third_place_count DESC, grade_a_count DESC;
END;
$$;


ALTER FUNCTION "public"."get_leaderboard_preview"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_ranking_mode" "text", "p_item_limit" integer, "p_use_public_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_access_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT jsonb_build_object(
    'authenticated', true,
    'tenant_id', p.tenant_id,
    'access_disabled', COALESCE(t.access_disabled, false),
    'superadmin', COALESCE(p.is_superadmin, false)
  )
  INTO v_result
  FROM public.profiles p
  LEFT JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.id = v_uid;

  -- No profile row: treat as not tenant-scoped (participant/superadmin-only).
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', true,
      'tenant_id', NULL,
      'access_disabled', false,
      'superadmin', false
    );
  END IF;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_my_access_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_login_profile"() RETURNS TABLE("role" "text", "tenant_id" "uuid", "is_superadmin" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT p.role, p.tenant_id, p.is_superadmin
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_login_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT id FROM public.organisations WHERE tenant_id = public.get_my_tenant_id() LIMIT 1;
$$;


ALTER FUNCTION "public"."get_my_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.tenant_id
  FROM public.profiles p
  JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.id = auth.uid()
    AND t.access_disabled = false;
$$;


ALTER FUNCTION "public"."get_my_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_festival_chest_number"("p_festival_id" "uuid", "p_category_code" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_tenant_id uuid;
  v_range integer;
  v_category_position integer;
  v_next integer;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id, chest_number_category_range INTO v_tenant_id, v_range
  FROM public.festival_calendar WHERE id = p_festival_id;
  IF NOT FOUND OR v_actor.id IS NULL THEN RAISE EXCEPTION 'Festival not found or authentication is required.'; END IF;
  IF v_actor.is_superadmin IS NOT TRUE
     AND (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_tenant_id) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can generate chest numbers.';
  END IF;

  WITH codes AS (
    SELECT lower(btrim(code)) AS category_code
    FROM public.festival_categories
    WHERE festival_id = p_festival_id
    UNION
    SELECT DISTINCT lower(btrim(category_code)) AS category_code
    FROM public.participants WHERE festival_id = p_festival_id AND btrim(COALESCE(category_code, '')) <> ''
    UNION SELECT lower(btrim(p_category_code))
  ), ordered AS (
    SELECT category_code, row_number() OVER (
      ORDER BY fc.sort_order NULLS LAST,
      codes.category_code
    ) AS position
    FROM codes
    LEFT JOIN public.festival_categories fc
      ON fc.festival_id = p_festival_id
     AND lower(fc.code) = codes.category_code
  ) SELECT position INTO v_category_position FROM ordered WHERE category_code = lower(btrim(p_category_code));

  SELECT count(*) + 1 INTO v_next FROM public.participants
  WHERE festival_id = p_festival_id AND lower(btrim(category_code)) = lower(btrim(p_category_code));
  IF v_next > v_range THEN RAISE EXCEPTION 'Category capacity (%) reached. Change the festival range to Under 1000.', v_range; END IF;
  RETURN ((v_category_position * v_range) + v_next - 1)::text;
END;
$$;


ALTER FUNCTION "public"."get_next_festival_chest_number"("p_festival_id" "uuid", "p_category_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_page_health_check"("p_page_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_page          record;
  v_risk_score    int := 0;
  v_warnings      jsonb := '[]'::jsonb;
  v_dep_count     int := 0;
  v_dep_pages     text[];
BEGIN
  SELECT * INTO v_page FROM system_pages WHERE page_key = p_page_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Page not found');
  END IF;

  -- Check 1: Is this page a dependency of other pages?
  SELECT
    count(*),
    array_agg(page_name)
  INTO v_dep_count, v_dep_pages
  FROM system_pages
  WHERE p_page_key = ANY(dependencies);

  IF v_dep_count > 0 THEN
    v_risk_score  := v_risk_score + v_dep_count;
    v_warnings    := v_warnings || jsonb_build_array(
      jsonb_build_object(
        'type', 'DEPENDENCY',
        'message', 'This page is referenced by ' || v_dep_count || ' system module(s)',
        'affected_pages', v_dep_pages
      )
    );
  END IF;

  -- Check 2: Is this page critical?
  IF v_page.is_critical THEN
    v_risk_score := v_risk_score + 10;
    v_warnings   := v_warnings || jsonb_build_array(
      jsonb_build_object(
        'type', 'CRITICAL',
        'message', 'This is a critical system page. Lock and Maintenance actions are permanently disabled.'
      )
    );
  END IF;

  -- Update cached risk_score
  UPDATE system_pages SET risk_score = v_risk_score WHERE page_key = p_page_key;

  RETURN jsonb_build_object(
    'success', true,
    'page_key', p_page_key,
    'risk_score', v_risk_score,
    'lock_allowed', v_risk_score = 0 AND NOT v_page.is_critical,
    'warnings', v_warnings,
    'dependency_count', v_dep_count
  );
END;
$$;


ALTER FUNCTION "public"."get_page_health_check"("p_page_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_candidate_profile"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant record;
  v_result jsonb;
BEGIN
  SELECT
    p.id,
    p.profile_slug,
    p.name,
    p.photo_url,
    p.category_code,
    p.profile_bio,
    p.public_profile_enabled,
    p.show_organisation_public,
    org.name AS organisation_name,
    org.org_type AS organisation_type
  INTO v_participant
  FROM participants p
  LEFT JOIN organisations org ON org.id = p.organisation_id
  WHERE p.profile_slug = p_slug
    AND COALESCE(p.public_profile_enabled, true) IS TRUE
  LIMIT 1;

  IF v_participant.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_participant.id,
      'slug', v_participant.profile_slug,
      'name', v_participant.name,
      'photo_url', v_participant.photo_url,
      'category_code', v_participant.category_code,
      'bio', COALESCE(v_participant.profile_bio, ''),
      'organisation_name', CASE WHEN COALESCE(v_participant.show_organisation_public, true) THEN v_participant.organisation_name ELSE NULL END,
      'organisation_type', CASE WHEN COALESCE(v_participant.show_organisation_public, true) THEN v_participant.organisation_type ELSE NULL END
    ),
    'participated_items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'registration_id', reg.id,
          'item_id', itm.id,
          'item_name', COALESCE(itm.item_name_en, ''),
          'item_name_ml', COALESCE(itm.item_name_ml, ''),
          'category_codes', COALESCE(itm.category_codes, ARRAY[]::text[]),
          'participation_type', COALESCE(itm.participation_type, 'individual'),
          'status', COALESCE(reg.status, 'registered')
        )
        ORDER BY COALESCE(itm.item_name_ml, itm.item_name_en, '')
      )
      FROM registrations reg
      LEFT JOIN items itm ON itm.id = reg.item_id
      WHERE reg.participant_id = v_participant.id
        AND reg.status IS DISTINCT FROM 'rejected'
    ), '[]'::jsonb),
    'published_results', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'result_id', res.id,
          'item_id', itm.id,
          'item_name', COALESCE(itm.item_name_en, ''),
          'item_name_ml', COALESCE(itm.item_name_ml, ''),
          'rank', res.rank,
          'grade', res.grade,
          'points_awarded', COALESCE(res.points_awarded, 0),
          'published_at', res.published_at
        )
        ORDER BY res.rank NULLS LAST, res.published_at DESC NULLS LAST
      )
      FROM results res
      LEFT JOIN registrations reg ON reg.id = res.registration_id
      LEFT JOIN items itm ON itm.id = res.item_id
      WHERE reg.participant_id = v_participant.id
        AND res.published IS TRUE
        AND COALESCE(res.result_status, 'draft') = 'published'
        AND COALESCE(res.public_visible, false) IS TRUE
        AND reg.status IS DISTINCT FROM 'rejected'
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_public_candidate_profile"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_leaderboard"("p_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("organisation_id" "uuid", "organisation_name" "text", "organisation_type" "text", "parent_id" "uuid", "total_points" bigint, "first_place_count" bigint, "second_place_count" bigint, "third_place_count" bigint, "grade_a_plus_count" bigint, "grade_a_count" bigint, "grade_b_count" bigint, "grade_c_count" bigint, "result_count" bigint, "latest_published_at" timestamp with time zone, "grace_marks_awarded" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_festival_id uuid;
  v_is_public_visible boolean;
  v_caller_is_admin boolean;
  v_festival_tenant_id uuid;
  v_enable_grace_marks boolean := false;
  v_ranking_mode text;
  v_item_limit integer;
BEGIN
  -- 1. Resolve festival ID
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Get the festival's tenant_id
  SELECT tenant_id INTO v_festival_tenant_id
  FROM festival_calendar
  WHERE id = v_festival_id;

  -- 3. Verify visibility permissions
  SELECT COALESCE(is_public_visible, false), ranking_mode, item_limit
  INTO v_is_public_visible, v_ranking_mode, v_item_limit
  FROM festival_leaderboard_settings
  WHERE festival_id = v_festival_id
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_is_public_visible AND NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  -- Check if grace marks are enabled
  SELECT COALESCE(enable_grace_marks, false) INTO v_enable_grace_marks
  FROM points_config
  WHERE festival_id = v_festival_id
  ORDER BY config_version DESC
  LIMIT 1;

  -- 4. Execute query
  RETURN QUERY
  WITH limited_items AS (
    SELECT item_id
    FROM results
    WHERE festival_id = v_festival_id
      AND published IS TRUE
      AND COALESCE(result_status, 'draft') IN ('published', 'ready')
      AND COALESCE(public_visible, false) IS TRUE
    GROUP BY item_id
    ORDER BY MIN(published_at) ASC, item_id ASC
    LIMIT (CASE WHEN COALESCE(v_ranking_mode, 'ALL') = 'LIMITED' AND v_item_limit IS NOT NULL AND v_item_limit > 0 THEN v_item_limit ELSE 999999 END)
  ),
  deduped_results AS (
    SELECT DISTINCT ON (COALESCE(res.registration_id, res.id), res.item_id)
      res.id           AS result_id,
      res.points_awarded,
      res.rank,
      res.grade,
      res.published_at,
      res.registration_id,
      res.festival_id
    FROM results res
    LEFT JOIN registrations reg ON reg.id = res.registration_id
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'draft') IN ('published', 'ready')
      AND COALESCE(res.public_visible, false) IS TRUE
      AND reg.status IS DISTINCT FROM 'rejected'
      AND res.item_id IN (SELECT item_id FROM limited_items)
    ORDER BY COALESCE(res.registration_id, res.id), res.item_id,
             res.published_at DESC NULLS LAST, res.id DESC
  )
  SELECT
    org.id                                                        AS organisation_id,
    COALESCE(org.name, 'Unassigned')                              AS organisation_name,
    org.org_type                                                  AS organisation_type,
    org.parent_id                                                 AS parent_id,
    COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0)::bigint + 
      (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS total_points,
    COUNT(*) FILTER (WHERE res.rank = 1)::bigint                 AS first_place_count,
    COUNT(*) FILTER (WHERE res.rank = 2)::bigint                 AS second_place_count,
    COUNT(*) FILTER (WHERE res.rank = 3)::bigint                 AS third_place_count,
    COUNT(*) FILTER (WHERE res.grade = 'A+')::bigint             AS grade_a_plus_count,
    COUNT(*) FILTER (WHERE res.grade = 'A')::bigint              AS grade_a_count,
    COUNT(*) FILTER (WHERE res.grade = 'B')::bigint              AS grade_b_count,
    COUNT(*) FILTER (WHERE res.grade = 'C')::bigint              AS grade_c_count,
    COUNT(*)::bigint                                              AS result_count,
    MAX(res.published_at)                                         AS latest_published_at,
    (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS grace_marks_awarded
  FROM deduped_results res
  JOIN festival_calendar festival ON festival.id = res.festival_id
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE org.id IS NOT NULL
    AND (
      org.tenant_id = v_festival_tenant_id
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
      )
      OR org.tenant_id IN (
        SELECT DISTINCT o2.tenant_id
        FROM organisations o2
        WHERE o2.id = org.parent_id AND o2.tenant_id = v_festival_tenant_id
      )
    )
  GROUP BY org.id
  HAVING COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0) > 0 OR COUNT(*) > 0
  ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC, third_place_count DESC, grade_a_count DESC;
END;
$$;


ALTER FUNCTION "public"."get_public_leaderboard"("p_tenant_id" "uuid", "p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_leaderboard_scoped"("p_tenant_id" "uuid", "p_festival_id" "uuid") RETURNS SETOF "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_festival_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.festival_calendar fc
    WHERE fc.id = p_festival_id
      AND fc.tenant_id = p_tenant_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT to_jsonb(row_data)
  FROM public.get_public_leaderboard(p_tenant_id, p_festival_id) AS row_data;
END;
$$;


ALTER FUNCTION "public"."get_public_leaderboard_scoped"("p_tenant_id" "uuid", "p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_leaderboard_settings"("p_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("festival_id" "uuid", "festival_level" "text", "is_public_visible" boolean, "show_individual_rankings" boolean, "team_point_status" "text", "public_festival_name" "text", "theme_config" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_festival_id uuid;
BEGIN
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC, start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fc.id AS festival_id,
    fc.level AS festival_level,
    COALESCE(settings.is_public_visible, false) AS is_public_visible,
    COALESCE(settings.show_individual_rankings, true) AS show_individual_rankings,
    settings.team_point_status AS team_point_status,
    COALESCE(
      NULLIF(trim(settings.public_festival_name), ''),
      NULLIF(trim(fc.custom_name), ''),
      'Festival'
    ) AS public_festival_name,
    settings.theme_config AS theme_config
  FROM festival_calendar fc
  LEFT JOIN festival_leaderboard_settings settings
    ON settings.festival_id = fc.id
  WHERE fc.id = v_festival_id
    AND (p_tenant_id IS NULL OR fc.tenant_id = p_tenant_id)
    AND COALESCE(settings.is_public_visible, false) IS TRUE;
END;
$$;


ALTER FUNCTION "public"."get_public_leaderboard_settings"("p_tenant_id" "uuid", "p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_published_results"("p_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid", "p_include_participant_details" boolean DEFAULT true) RETURNS TABLE("result_id" "uuid", "registration_id" "uuid", "item_id" "uuid", "item_name" "text", "item_name_ml" "text", "is_group" boolean, "item_category_codes" "text"[], "organisation_id" "uuid", "organisation_name" "text", "organisation_type" "text", "participant_id" "uuid", "participant_name" "text", "participant_profile_slug" "text", "chest_number" "text", "participant_category_code" "text", "rank" integer, "grade" "text", "points_awarded" integer, "published_at" timestamp with time zone, "festival_level" "text", "public_result_no" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_festival_id uuid;
  v_festival_tenant_id uuid;
  v_festival_level text;
  v_is_public_visible boolean := false;
  v_caller_is_admin boolean := false;
BEGIN
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC, start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  SELECT tenant_id, level
  INTO v_festival_tenant_id, v_festival_level
  FROM festival_calendar
  WHERE id = v_festival_id;

  SELECT COALESCE(is_public_visible, false)
  INTO v_is_public_visible
  FROM festival_leaderboard_settings
  WHERE festival_id = v_festival_id
  LIMIT 1;

  SELECT (p_tenant_id IS NOT NULL OR p_festival_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  -- Admin can still bypass the GLOBAL visibility toggle to preview the page
  IF (v_is_public_visible IS NOT TRUE) AND (NOT v_caller_is_admin) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH published_results AS (
    SELECT DISTINCT ON (COALESCE(res.registration_id, res.id), res.item_id)
      res.id,
      res.registration_id,
      res.item_id,
      res.rank,
      res.grade,
      COALESCE(res.points_awarded, 0) AS points_awarded,
      res.published_at,
      res.festival_id,
      res.public_result_no
    FROM results res
    LEFT JOIN registrations reg ON reg.id = res.registration_id
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'draft') = 'published'
      AND COALESCE(res.public_visible, false) IS TRUE
      AND reg.status IS DISTINCT FROM 'rejected'
    ORDER BY COALESCE(res.registration_id, res.id), res.item_id,
             res.published_at DESC NULLS LAST, res.id DESC
  )
  SELECT
    res.id AS result_id,
    res.registration_id,
    res.item_id,
    COALESCE(itm.item_name_en, '') AS item_name,
    COALESCE(itm.item_name_ml, '') AS item_name_ml,
    COALESCE(itm.participation_type = 'group', false) AS is_group,
    COALESCE(itm.category_codes, ARRAY[]::text[]) AS item_category_codes,
    org.id AS organisation_id,
    COALESCE(org.name, 'Unassigned') AS organisation_name,
    org.org_type AS organisation_type,
    CASE WHEN p_include_participant_details THEN participant.id ELSE NULL END AS participant_id,
    CASE WHEN p_include_participant_details THEN COALESCE(participant.name, '') ELSE '' END AS participant_name,
    CASE WHEN p_include_participant_details AND COALESCE(participant.public_profile_enabled, true) THEN participant.profile_slug ELSE NULL END AS participant_profile_slug,
    CASE WHEN p_include_participant_details THEN COALESCE(participant.chest_number, '') ELSE '' END AS chest_number,
    CASE WHEN p_include_participant_details THEN participant.category_code ELSE NULL END AS participant_category_code,
    res.rank,
    res.grade,
    res.points_awarded,
    res.published_at,
    v_festival_level AS festival_level,
    res.public_result_no
  FROM published_results res
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN items itm ON itm.id = res.item_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE org.id IS NOT NULL
    AND participant.id IS NOT NULL
    AND (
      org.tenant_id = v_festival_tenant_id
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
      )
      OR org.tenant_id IN (
        SELECT DISTINCT o2.tenant_id
        FROM organisations o2
        WHERE o2.parent_id IN (
          SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
        )
      )
    )
  ORDER BY res.published_at DESC NULLS LAST, res.item_id, res.rank NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_public_published_results"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_include_participant_details" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_published_results_scoped"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_include_participant_details" boolean DEFAULT true) RETURNS SETOF "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_festival_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.festival_calendar fc
    WHERE fc.id = p_festival_id
      AND fc.tenant_id = p_tenant_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT to_jsonb(row_data)
  FROM public.get_public_published_results(
    p_tenant_id,
    p_festival_id,
    p_include_participant_details
  ) AS row_data;
END;
$$;


ALTER FUNCTION "public"."get_public_published_results_scoped"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_include_participant_details" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_terminology"("p_tenant_id" "uuid") RETURNS TABLE("org_level_1_label" "text", "org_level_2_label" "text", "org_level_3_label" "text", "org_level_4_label" "text", "org_level_5_label" "text", "festival_name" "text", "organization_name" "text", "participant_label" "text", "registration_label" "text", "result_label" "text", "schedule_label" "text", "venue_label" "text", "judge_label" "text", "score_label" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    t.org_level_1_label, t.org_level_2_label, t.org_level_3_label,
    t.org_level_4_label, t.org_level_5_label,
    t.festival_name, t.organization_name,
    t.participant_label, t.registration_label, t.result_label,
    t.schedule_label, t.venue_label, t.judge_label, t.score_label
  FROM public.tenant_terminology t
  WHERE t.tenant_id = p_tenant_id;
$$;


ALTER FUNCTION "public"."get_public_terminology"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_unit_profile"("p_unit_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org record;
  v_result jsonb;
BEGIN
  -- Fetch organisation details
  SELECT
    id, name, parent_id
  INTO v_org
  FROM organisations
  WHERE id = p_unit_id
  LIMIT 1;

  IF v_org.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build JSON
  SELECT jsonb_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'parent_id', v_org.parent_id,
    'participants', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'chest_number', p.chest_number,
          'category_code', p.category_code,
          'profile_slug', p.profile_slug,
          'status', p.status,
          'photo_url', p.photo_url,
          'registrations', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'status', r.status,
                'item_id', r.item_id,
                'item', jsonb_build_object(
                  'name', i.item_name_en,
                  'name_ml', i.item_name_ml
                ),
                'results', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'rank', res.rank,
                      'grade', res.grade,
                      'points_awarded', res.points_awarded
                    )
                  )
                  FROM results res
                  WHERE res.registration_id = r.id
                    AND res.published IS TRUE
                    AND COALESCE(res.public_visible, false) IS TRUE
                ), '[]'::jsonb)
              )
            )
            FROM registrations r
            LEFT JOIN items i ON i.id = r.item_id
            WHERE r.participant_id = p.id
          ), '[]'::jsonb)
        )
      )
      FROM participants p
      WHERE p.organisation_id = v_org.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_public_unit_profile"("p_unit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_verification_status"("p_tenant_id" "uuid") RETURNS TABLE("schedule_id" "uuid", "has_results" boolean, "has_marks" boolean, "has_codes" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    s.id AS schedule_id,
    EXISTS (SELECT 1 FROM results r WHERE r.item_id = s.item_id) AS has_results,
    EXISTS (SELECT 1 FROM mark_entries m WHERE m.schedule_id = s.id AND m.is_final = true) AS has_marks,
    EXISTS (SELECT 1 FROM registrations r WHERE r.item_id = s.item_id AND r.code_letter IS NOT NULL) AS has_codes
  FROM schedules s
  WHERE s.tenant_id = p_tenant_id;
$$;


ALTER FUNCTION "public"."get_public_verification_status"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_schedule_readiness"("p_schedule_id" "uuid") RETURNS TABLE("registration_id" "uuid", "code_letter" "text", "submitted_count" bigint, "pending_count" bigint, "expected_count" integer, "all_submitted" boolean, "readiness_status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT reg.id, reg.code_letter,
         COUNT(DISTINCT me.judge_id) FILTER (WHERE me.is_final = true),
         GREATEST(s.expected_judge_count - COUNT(DISTINCT me.judge_id)
           FILTER (WHERE me.is_final = true), 0)::bigint,
         s.expected_judge_count,
         COUNT(DISTINCT a.judge_id) = s.expected_judge_count
           AND COUNT(DISTINCT me.judge_id) FILTER (WHERE me.is_final = true) >= s.expected_judge_count,
         CASE
           WHEN COUNT(DISTINCT a.judge_id) = s.expected_judge_count
            AND COUNT(DISTINCT me.judge_id) FILTER (WHERE me.is_final = true) >= s.expected_judge_count
             THEN 'Ready for Calculation'
           WHEN COUNT(DISTINCT me.judge_id) FILTER (WHERE me.is_final = true) > 0
             THEN 'Partially Submitted'
           ELSE 'Waiting for Judges'
         END
  FROM public.registrations reg
  JOIN public.schedules s
    ON s.id = p_schedule_id
   AND reg.item_id = s.item_id
   AND reg.festival_id = s.festival_id
   AND reg.tenant_id = s.tenant_id
  LEFT JOIN public.schedule_judge_assignments a
    ON a.schedule_id = s.id AND a.status = 'active'
  LEFT JOIN public.mark_entries me
    ON me.registration_id = reg.id
   AND me.schedule_id = s.id
   AND me.judge_id = a.judge_id
  WHERE reg.status IS DISTINCT FROM 'rejected'
    AND reg.code_letter IS NOT NULL
    AND (public.is_superadmin() OR s.tenant_id = public.get_my_tenant_id())
  GROUP BY reg.id, reg.code_letter, s.expected_judge_count;
$$;


ALTER FUNCTION "public"."get_schedule_readiness"("p_schedule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_schedule_registrations"("p_schedule_id" "uuid") RETURNS TABLE("id" "uuid", "item_id" "uuid", "participant_id" "uuid", "organisation_id" "uuid", "festival_id" "uuid", "tenant_id" "uuid", "status" "text", "is_verified" boolean, "code_letter" "text", "participants" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_festival_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  SELECT s.* INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id
    AND s.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested schedule is outside the current tenant scope.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(v_schedule.festival_id, i.festival_id)
    INTO v_festival_id
  FROM public.items i
  WHERE i.id = v_schedule.item_id;

  IF v_festival_id IS NULL THEN
    RAISE EXCEPTION 'The schedule festival context is missing.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.item_id, r.participant_id, r.organisation_id,
         r.festival_id, r.tenant_id, r.status, r.is_verified, r.code_letter,
         to_jsonb(p) AS participants
  FROM public.registrations r
  JOIN public.participants p
    ON p.id = r.participant_id
   AND p.festival_id = v_festival_id
   AND (
     p.organisation_id IN (
       SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
     )
     OR p.tenant_id IN (
       SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
     )
   )
  WHERE r.festival_id = v_festival_id
    AND r.item_id = v_schedule.item_id
    AND (
      r.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR r.tenant_id IN (
        SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
      )
    )
  ORDER BY p.chest_number NULLS LAST, p.name, r.id;
END;
$$;


ALTER FUNCTION "public"."get_schedule_registrations"("p_schedule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stage_management_context"() RETURNS TABLE("tenant_id" "uuid", "festival_id" "uuid", "festival_name" "text", "festival_level" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  RETURN QUERY
  SELECT f.tenant_id,
         f.id,
         COALESCE(NULLIF(trim(f.custom_name), ''),
                  initcap(COALESCE(f.level, 'festival')) || ' Festival'),
         f.level
  FROM public.festival_calendar f
  WHERE f.tenant_id = v_tenant_id
    AND f.is_active IS TRUE
  ORDER BY f.festival_year DESC, f.start_date DESC NULLS LAST, f.id DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_stage_management_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stage_management_registrations"("p_schedule_id" "uuid" DEFAULT NULL::"uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "item_id" "uuid", "participant_id" "uuid", "organisation_id" "uuid", "status" "text", "is_verified" boolean, "code_letter" "text", "participant_name" "text", "participant_chest_number" "text", "participant_category_code" "text", "organisation_name" "text", "organisation_type" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_festival_id uuid;
  v_item_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF p_schedule_id IS NOT NULL THEN
    SELECT s.festival_id, s.item_id
      INTO v_festival_id, v_item_id
    FROM public.schedules s
    WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The requested schedule does not belong to this tenant.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    v_festival_id := p_festival_id;
    IF v_festival_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.festival_calendar f
      WHERE f.id = v_festival_id
        AND f.tenant_id = v_tenant_id
        AND f.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'The requested festival is not active for this tenant.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT r.id, r.item_id, r.participant_id, r.organisation_id,
         r.status, r.is_verified, r.code_letter,
         p.name, p.chest_number, p.category_code,
         o.name, o.org_type
  FROM public.registrations r
  JOIN public.participants p
    ON p.id = r.participant_id
   AND p.festival_id = v_festival_id
  LEFT JOIN public.organisations o ON o.id = r.organisation_id
  WHERE r.festival_id = v_festival_id
    AND (v_item_id IS NULL OR r.item_id = v_item_id)
    AND (
      r.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR r.tenant_id IN (
        SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR p.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
    )
  ORDER BY p.chest_number NULLS LAST, p.name, r.id;
END;
$$;


ALTER FUNCTION "public"."get_stage_management_registrations"("p_schedule_id" "uuid", "p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stage_management_registrations_scoped"("p_schedule_id" "uuid" DEFAULT NULL::"uuid", "p_festival_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "schedule_id" "uuid", "item_id" "uuid", "participant_id" "uuid", "organisation_id" "uuid", "status" "text", "is_verified" boolean, "code_letter" "text", "participant_name" "text", "participant_chest_number" "text", "participant_category_code" "text", "organisation_name" "text", "organisation_type" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_festival_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF p_schedule_id IS NOT NULL THEN
    SELECT s.festival_id INTO v_festival_id
    FROM public.schedules s
    WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The requested schedule does not belong to this tenant.' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_festival_id := p_festival_id;
    IF v_festival_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.festival_calendar f
      WHERE f.id = v_festival_id AND f.tenant_id = v_tenant_id AND f.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'The requested festival is not active for this tenant.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT r.id, s.id, r.item_id, r.participant_id, r.organisation_id,
         r.status, r.is_verified, r.code_letter,
         p.name, p.chest_number, p.category_code,
         o.name, o.org_type
  FROM public.registrations r
  JOIN public.participants p ON p.id = r.participant_id
    AND p.festival_id = v_festival_id
  JOIN public.schedules s ON s.tenant_id = v_tenant_id
    AND s.festival_id = v_festival_id
    AND s.item_id = r.item_id
    AND (p_schedule_id IS NULL OR s.id = p_schedule_id)
  LEFT JOIN public.organisations o ON o.id = r.organisation_id
  WHERE r.festival_id = v_festival_id
    AND (
      r.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR r.tenant_id IN (
        SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR p.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
    )
  ORDER BY p.chest_number NULLS LAST, p.name, r.id, s.id;
END;
$$;


ALTER FUNCTION "public"."get_stage_management_registrations_scoped"("p_schedule_id" "uuid", "p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stage_management_schedules"("p_festival_id" "uuid") RETURNS TABLE("id" "uuid", "tenant_id" "uuid", "festival_id" "uuid", "item_id" "uuid", "venue_id" "uuid", "start_time" timestamp with time zone, "end_time" timestamp with time zone, "status" "text", "is_shuffle_locked" boolean, "shuffle_locked_at" timestamp with time zone, "item_code" "text", "item_name_en" "text", "item_name_ml" "text", "category_codes" "text"[], "venue_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF NOT EXISTS (
    SELECT 1 FROM public.festival_calendar f
    WHERE f.id = p_festival_id
      AND f.tenant_id = v_tenant_id
      AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id, s.tenant_id, s.festival_id, s.item_id, s.venue_id,
         s.start_time, s.end_time, s.status,
         COALESCE(s.is_shuffle_locked, false), s.shuffle_locked_at,
         i.item_code, i.item_name_en, i.item_name_ml, i.category_codes,
         v.name
  FROM public.schedules s
  JOIN public.items i
    ON i.id = s.item_id
   AND i.tenant_id = v_tenant_id
   AND i.festival_id = p_festival_id
  LEFT JOIN public.venues v
    ON v.id = s.venue_id
   AND v.tenant_id = v_tenant_id
   AND v.festival_id = p_festival_id
  WHERE s.tenant_id = v_tenant_id
    AND s.festival_id = p_festival_id
  ORDER BY s.start_time NULLS LAST, s.id;
END;
$$;


ALTER FUNCTION "public"."get_stage_management_schedules"("p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stage_management_venues"("p_festival_id" "uuid") RETURNS TABLE("id" "uuid", "tenant_id" "uuid", "festival_id" "uuid", "name" "text", "location" "text", "capacity" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF NOT EXISTS (
    SELECT 1
    FROM public.festival_calendar f
    WHERE f.id = p_festival_id
      AND f.tenant_id = v_tenant_id
      AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id, v.tenant_id, p_festival_id, v.name, v.location, v.capacity
  FROM public.venues v
  WHERE v.tenant_id = v_tenant_id
    AND (
      v.festival_id = p_festival_id
      OR (
        v.festival_id IS NULL
        AND (
          SELECT count(*)
          FROM public.festival_calendar legacy_festival
          WHERE legacy_festival.tenant_id = v_tenant_id
            AND legacy_festival.is_active IS TRUE
        ) = 1
      )
    )
  ORDER BY v.name, v.id;
END;
$$;


ALTER FUNCTION "public"."get_stage_management_venues"("p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_strategic_publish_order"("p_festival_id" "uuid", "p_tenant_id" "uuid") RETURNS TABLE("result_id" "text", "item_name" "text", "suspense_score" numeric, "recommended_order" integer, "new_1st_points" numeric, "new_2nd_points" numeric, "new_3rd_points" numeric, "leader_name" "text", "is_public" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_unpublished_item RECORD;
  v_new_points numeric[];
  v_score numeric;
  v_rank_1 numeric;
  v_rank_2 numeric;
  v_rank_3 numeric;
  v_leader text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS temp_suspense_scores (
    res_id text,
    i_name text,
    s_score numeric,
    p_1st numeric,
    p_2nd numeric,
    p_3rd numeric,
    l_name text
  ) ON COMMIT DROP;
  TRUNCATE temp_suspense_scores;

  CREATE TEMP TABLE IF NOT EXISTS current_points (
    org_id uuid,
    total_points numeric,
    org_name text
  ) ON COMMIT DROP;
  TRUNCATE current_points;

  INSERT INTO current_points (org_id, total_points, org_name)
  SELECT 
    reg.organisation_id, 
    SUM(COALESCE(r.points_awarded, 0)) as total_points,
    MAX(o.name)
  FROM public.results r
  JOIN public.registrations reg ON reg.id = r.registration_id
  JOIN public.organisations o ON o.id = reg.organisation_id
  WHERE r.festival_id = p_festival_id 
    AND r.public_visible = true
  GROUP BY reg.organisation_id;

  FOR v_unpublished_item IN 
    SELECT DISTINCT r.item_id, COALESCE(i.item_name_en, i.item_name_ml, i.item_code) as item_name
    FROM public.results r
    JOIN public.items i ON i.id = r.item_id
    WHERE r.festival_id = p_festival_id 
      AND r.result_status = 'published'
      AND r.public_visible = false
  LOOP
    WITH combined AS (
      SELECT org_id, total_points, org_name FROM current_points
      UNION ALL
      SELECT 
        reg.organisation_id as org_id,
        SUM(COALESCE(r.points_awarded, 0)) as total_points,
        MAX(o.name) as org_name
      FROM public.results r
      JOIN public.registrations reg ON reg.id = r.registration_id
      JOIN public.organisations o ON o.id = reg.organisation_id
      WHERE r.item_id = v_unpublished_item.item_id
      GROUP BY reg.organisation_id
    ),
    hypothetical_points AS (
      SELECT org_id, MAX(org_name) as org_name, SUM(total_points) as total_points
      FROM combined
      GROUP BY org_id
    )
    SELECT 
      array_agg(total_points ORDER BY total_points DESC),
      (SELECT org_name FROM hypothetical_points ORDER BY total_points DESC LIMIT 1)
    INTO v_new_points, v_leader
    FROM hypothetical_points;

    v_rank_1 := COALESCE(v_new_points[1], 0);
    v_rank_2 := COALESCE(v_new_points[2], 0);
    v_rank_3 := COALESCE(v_new_points[3], 0);
    v_score := COALESCE((v_rank_1 - v_rank_2) + (v_rank_2 - v_rank_3), 0);

    INSERT INTO temp_suspense_scores 
    VALUES (
      v_unpublished_item.item_id::text, 
      v_unpublished_item.item_name, 
      v_score, 
      v_rank_1, 
      v_rank_2, 
      v_rank_3, 
      COALESCE(v_leader, 'None')
    );
  END LOOP;

  RETURN QUERY 
  SELECT 
    res_id,
    i_name,
    s_score,
    (ROW_NUMBER() OVER (ORDER BY s_score ASC))::integer,
    p_1st,
    p_2nd,
    p_3rd,
    l_name,
    false as is_public
  FROM temp_suspense_scores
  ORDER BY s_score ASC;
END;
$$;


ALTER FUNCTION "public"."get_strategic_publish_order"("p_festival_id" "uuid", "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_leader_announcements"() RETURNS TABLE("id" "uuid", "title" "text", "message" "text", "type" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT a.id, a.title, a.message, a.type, a.created_at
  FROM public.announcements a JOIN public.get_team_leader_context() c
    ON c.festival_id = a.festival_id AND c.parent_tenant_id = a.tenant_id
  WHERE a.target_role IN ('all', 'team_leader', 'participant') ORDER BY a.created_at DESC;
$$;


ALTER FUNCTION "public"."get_team_leader_announcements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_leader_assignments_for_admin"("p_festival_id" "uuid") RETURNS TABLE("id" "uuid", "user_id" "uuid", "festival_team_id" "uuid", "organisation_id" "uuid", "status" "text", "assigned_at" timestamp with time zone, "created_at" timestamp with time zone, "team_name" "text", "leader_email" "text", "leader_code" "text", "leader_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller public.profiles;
BEGIN
  SELECT * INTO v_caller
  FROM public.profiles
  WHERE profiles.id = auth.uid();

  IF v_caller.id IS NULL
     OR (v_caller.role IS DISTINCT FROM 'admin' AND v_caller.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only an authorized administrator may view Team Leader assignments.';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.user_id,
    a.festival_team_id,
    ft.organisation_id,
    a.status,
    a.assigned_at,
    a.created_at,
    o.name,
    p.team_leader_email,
    p.team_leader_code,
    p.full_name
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.organisations o ON o.id = ft.organisation_id
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.status = 'active'
    AND ft.is_active = true
    AND ft.festival_id = p_festival_id
    AND (
      public.is_superadmin()
      OR public.is_org_visible(ft.organisation_id)
      OR ft.parent_tenant_id IS NOT DISTINCT FROM public.get_my_tenant_id()
    );
END;
$$;


ALTER FUNCTION "public"."get_team_leader_assignments_for_admin"("p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_leader_context"() RETURNS TABLE("assignment_id" "uuid", "parent_tenant_id" "uuid", "festival_id" "uuid", "festival_team_id" "uuid", "organisation_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT a.id, ft.parent_tenant_id, ft.festival_id, ft.id, ft.organisation_id
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.festival_calendar f ON f.id = ft.festival_id
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.team_portal_settings s
    ON s.parent_tenant_id = ft.parent_tenant_id AND s.festival_id = ft.festival_id
  WHERE a.user_id = auth.uid()
    AND p.role = 'team_leader'
    AND a.status = 'active'
    AND a.revoked_at IS NULL
    AND a.valid_from <= now()
    AND (a.valid_until IS NULL OR a.valid_until > now())
    AND ft.is_active
    AND f.is_active
    AND COALESCE(s.is_enabled, true)
    AND (s.opens_at IS NULL OR s.opens_at <= now())
    AND (s.closes_at IS NULL OR s.closes_at > now())
  ORDER BY a.assigned_at DESC
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_team_leader_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_leader_context_details"() RETURNS TABLE("assignment_id" "uuid", "parent_tenant_id" "uuid", "festival_id" "uuid", "festival_team_id" "uuid", "organisation_id" "uuid", "team_name" "text", "festival_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT a.id,
         ft.parent_tenant_id,
         ft.festival_id,
         ft.id,
         ft.organisation_id,
         o.name,
         COALESCE(f.custom_name, 'Festival ' || f.festival_year::text)
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.organisations o ON o.id = ft.organisation_id
  JOIN public.festival_calendar f ON f.id = ft.festival_id
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.team_portal_settings s
    ON s.parent_tenant_id = ft.parent_tenant_id AND s.festival_id = ft.festival_id
  WHERE a.user_id = auth.uid()
    AND p.role = 'team_leader'
    AND a.status = 'active'
    AND a.revoked_at IS NULL
    AND a.valid_from <= now()
    AND (a.valid_until IS NULL OR a.valid_until > now())
    AND ft.is_active
    AND f.is_active
    AND COALESCE(s.is_enabled, true)
    AND (s.opens_at IS NULL OR s.opens_at <= now())
    AND (s.closes_at IS NULL OR s.closes_at > now())
  ORDER BY a.assigned_at DESC
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_team_leader_context_details"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_leader_participant_account"("p_participant_id" "uuid") RETURNS TABLE("user_id" "uuid", "full_name" "text", "role" "text", "team_leader_code" "text", "team_leader_email" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller public.profiles;
  v_participant public.participants;
BEGIN
  SELECT * INTO v_caller
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller.id IS NULL
     OR (v_caller.role IS DISTINCT FROM 'admin' AND v_caller.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only an authorized administrator may view Team Leader account status.';
  END IF;

  SELECT * INTO v_participant
  FROM public.participants
  WHERE id = p_participant_id;

  IF v_participant.id IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR public.is_org_visible(v_participant.organisation_id)
    OR public.get_my_tenant_id() IS NOT DISTINCT FROM v_participant.tenant_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: participant is outside the current tenant hierarchy.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.role, p.team_leader_code, p.team_leader_email
  FROM public.profiles p
  WHERE p.id = v_participant.user_id;
END;
$$;


ALTER FUNCTION "public"."get_team_leader_participant_account"("p_participant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_leader_participants"() RETURNS TABLE("id" "uuid", "name" "text", "gender" "text", "category_code" "text", "chest_number" "text", "status" "text", "festival_id" "uuid", "organisation_id" "uuid", "profile_slug" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT p.id, p.name, p.gender, p.category_code, p.chest_number,
         p.status, p.festival_id, p.organisation_id, p.profile_slug
  FROM public.participants p
  JOIN public.get_team_leader_context() c
    ON c.festival_id = p.festival_id
   AND c.organisation_id = p.organisation_id;
$$;


ALTER FUNCTION "public"."get_team_leader_participants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_leader_published_results"() RETURNS TABLE("result_id" "uuid", "item_code" "text", "item_name" "text", "participant_name" "text", "rank" integer, "grade" "text", "points_awarded" integer, "published_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT DISTINCT res.id, i.item_code, COALESCE(i.item_name_en, i.item_name_ml), p.name,
         res.rank, res.grade, res.points_awarded, res.published_at
  FROM public.results res JOIN public.get_team_leader_context() c
    ON c.festival_id = res.festival_id AND c.parent_tenant_id = res.tenant_id
  JOIN public.items i ON i.id = res.item_id AND (i.tenant_id IS NULL OR i.tenant_id = c.parent_tenant_id)
  JOIN public.registrations r ON r.id = res.registration_id AND r.tenant_id = c.parent_tenant_id
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.tenant_id = c.parent_tenant_id
  WHERE res.published IS TRUE AND res.result_status = 'published' AND res.public_visible IS TRUE
    AND r.organisation_id = c.organisation_id
  ORDER BY res.published_at DESC NULLS LAST, res.rank NULLS LAST;
$$;


ALTER FUNCTION "public"."get_team_leader_published_results"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_leader_schedule"() RETURNS TABLE("schedule_id" "uuid", "item_id" "uuid", "item_code" "text", "item_name" "text", "category_codes" "text"[], "venue_name" "text", "start_time" timestamp with time zone, "end_time" timestamp with time zone, "event_status" "text", "participant_count" bigint, "checked_in_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT s.id, s.item_id, i.item_code, COALESCE(i.item_name_en, i.item_name_ml), i.category_codes,
         v.name, s.start_time, s.end_time, s.status, COUNT(DISTINCT p.id),
         COUNT(DISTINCT r.id) FILTER (WHERE r.is_verified IS TRUE)
  FROM public.schedules s JOIN public.get_team_leader_context() c
    ON c.festival_id = s.festival_id AND c.parent_tenant_id = s.tenant_id
  JOIN public.items i ON i.id = s.item_id AND (i.tenant_id IS NULL OR i.tenant_id = c.parent_tenant_id)
  LEFT JOIN public.venues v ON v.id = s.venue_id AND v.tenant_id = c.parent_tenant_id
  LEFT JOIN public.registrations r ON r.festival_id = s.festival_id AND r.tenant_id = s.tenant_id
    AND r.item_id = s.item_id AND r.organisation_id = c.organisation_id AND r.status NOT IN ('rejected', 'cancelled')
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.tenant_id = c.parent_tenant_id
  GROUP BY s.id, s.item_id, i.item_code, i.item_name_en, i.item_name_ml, i.category_codes, v.name, s.start_time, s.end_time, s.status
  ORDER BY s.start_time NULLS LAST;
$$;


ALTER FUNCTION "public"."get_team_leader_schedule"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_leader_standings"() RETURNS TABLE("rank" bigint, "organisation_id" "uuid", "team_name" "text", "total_points" bigint, "is_own_team" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  WITH ctx AS (SELECT * FROM public.get_team_leader_context()),
  official AS (
    SELECT * FROM public.get_public_leaderboard((SELECT parent_tenant_id FROM ctx), (SELECT festival_id FROM ctx))
  ),
  teams AS (
    SELECT ft.organisation_id, o.name
    FROM public.festival_teams ft JOIN public.organisations o ON o.id = ft.organisation_id
    JOIN ctx ON ctx.festival_id = ft.festival_id AND ctx.parent_tenant_id = ft.parent_tenant_id
    WHERE ft.is_active
  )
  SELECT DENSE_RANK() OVER (ORDER BY COALESCE(official.total_points, 0) DESC,
    COALESCE(official.first_place_count, 0) DESC, COALESCE(official.second_place_count, 0) DESC, teams.name ASC),
    teams.organisation_id, teams.name, COALESCE(official.total_points, 0)::bigint,
    (teams.organisation_id = (SELECT organisation_id FROM ctx))
  FROM teams LEFT JOIN official ON official.organisation_id = teams.organisation_id
  ORDER BY 1, teams.name;
$$;


ALTER FUNCTION "public"."get_team_leader_standings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_leaderboard_agent_prompt"("p_tenant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_prompt jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Permission denied: superadmin access required';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'tenant_id', p.tenant_id,
    'festival_id', p.festival_id,
    'prompt_type', p.prompt_type,
    'prompt_version', p.prompt_version,
    'prompt_text', p.prompt_text,
    'contract_manifest', p.contract_manifest,
    'is_active', p.is_active,
    'generated_at', p.generated_at,
    'revoked_at', p.revoked_at
  ) INTO v_prompt
  FROM public.tenant_agent_prompts p
  WHERE p.tenant_id = p_tenant_id
    AND p.prompt_type = 'leaderboard_ui'
  ORDER BY p.is_active DESC, p.generated_at DESC
  LIMIT 1;

  RETURN COALESCE(v_prompt, jsonb_build_object('prompt', NULL));
END;
$$;


ALTER FUNCTION "public"."get_tenant_leaderboard_agent_prompt"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_terminology"("p_tenant_id" "uuid") RETURNS TABLE("org_level_1_label" "text", "org_level_2_label" "text", "org_level_3_label" "text", "org_level_4_label" "text", "org_level_5_label" "text", "festival_name" "text", "organization_name" "text", "participant_label" "text", "registration_label" "text", "result_label" "text", "schedule_label" "text", "venue_label" "text", "judge_label" "text", "score_label" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Verify caller belongs to this tenant or is superadmin
    IF NOT public.verify_tenant_access(p_tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized: you cannot access terminology for this tenant';
    END IF;

    RETURN QUERY
    SELECT 
        t.org_level_1_label, t.org_level_2_label, t.org_level_3_label,
        t.org_level_4_label, t.org_level_5_label,
        t.festival_name, t.organization_name,
        t.participant_label, t.registration_label, t.result_label,
        t.schedule_label, t.venue_label, t.judge_label, t.score_label
    FROM public.tenant_terminology t
    WHERE t.tenant_id = p_tenant_id;
END;
$$;


ALTER FUNCTION "public"."get_tenant_terminology"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_visible_organisations"("p_tenant_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "org_type" "text", "parent_id" "uuid", "tenant_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH RECURSIVE org_tree AS (
    SELECT o.id, o.name, o.org_type, o.parent_id, o.tenant_id
    FROM public.organisations o
    LEFT JOIN public.tenants t ON t.id = p_tenant_id
    WHERE (o.tenant_id = p_tenant_id OR o.id = t.organisation_id)
      AND o.archived_at IS NULL

    UNION ALL

    SELECT child.id, child.name, child.org_type, child.parent_id, child.tenant_id
    FROM public.organisations child
    INNER JOIN org_tree parent ON child.parent_id = parent.id
    WHERE child.archived_at IS NULL
  )
  SELECT DISTINCT * FROM org_tree ORDER BY name;
$$;


ALTER FUNCTION "public"."get_visible_organisations"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, is_superadmin)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'participant', false);
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_visible"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(public.get_my_tenant_id())
    WHERE id = p_org_id
  );
$$;


ALTER FUNCTION "public"."is_org_visible"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_super boolean;
  v_claim text;
BEGIN
  -- 1. Try to get from JWT Token
  v_claim := current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'is_superadmin';
  
  IF v_claim IS NOT NULL THEN
    RETURN v_claim::boolean;
  END IF;
  
  -- 2. Fallback to profiles table if token is old
  SELECT is_superadmin INTO v_is_super FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_is_super, false);
END;
$$;


ALTER FUNCTION "public"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_leader"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT COALESCE((
    SELECT p.role = 'team_leader'
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ), false);
$$;


ALTER FUNCTION "public"."is_team_leader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb", "p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_status text;
BEGIN
    INSERT INTO public.judge_activity_logs (tenant_id, judge_id, schedule_id, action_type, action_details, created_at)
    VALUES (p_tenant_id, p_judge_id, p_schedule_id, p_action_type, p_action_details, now());

    IF p_action_type = 'LOGIN' THEN
        v_status := 'OPENED';
    ELSIF p_action_type = 'MARKS_SUBMITTED' THEN
        v_status := 'SUBMITTED';
    ELSIF p_action_type = 'MARKS_UPDATED' THEN
        v_status := 'SUBMITTED';
    ELSE
        v_status := 'IN_PROGRESS';
    END IF;

    INSERT INTO public.judge_session_status (tenant_id, judge_id, schedule_id, status, login_at, last_activity_at)
    VALUES (p_tenant_id, p_judge_id, p_schedule_id, v_status, CASE WHEN p_action_type = 'LOGIN' THEN now() ELSE NULL END, now())
    ON CONFLICT (judge_id, schedule_id)
    DO UPDATE SET 
        status = v_status,
        last_activity_at = now(),
        login_at = CASE WHEN p_action_type = 'LOGIN' THEN now() ELSE public.judge_session_status.login_at END,
        submitted_at = CASE WHEN p_action_type IN ('MARKS_SUBMITTED', 'MARKS_UPDATED') THEN now() ELSE public.judge_session_status.submitted_at END,
        updated_at = now();
END;
$$;


ALTER FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb", "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb" DEFAULT '{}'::"jsonb", "p_token" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_token_id uuid;
  v_is_admin boolean;
BEGIN
  v_is_admin :=
    auth.uid() IS NOT NULL
    AND (
      public.is_superadmin()
      OR p_tenant_id = public.get_my_tenant_id()
    );

  IF NOT v_is_admin THEN
    IF p_token IS NULL OR trim(p_token) = '' THEN
      RAISE EXCEPTION 'An active judge token is required.';
    END IF;

    SELECT jt.id
    INTO v_token_id
    FROM public.judge_tokens jt
    WHERE jt.judge_id = p_judge_id
      AND jt.schedule_id = p_schedule_id
      AND jt.tenant_id = p_tenant_id
      AND (
        jt.token_hash = encode(
          extensions.digest(upper(trim(p_token)), 'sha256'),
          'hex'
        )
        OR jt.token = upper(trim(p_token))
      )
      AND jt.is_used = false
      AND jt.is_revoked IS NOT TRUE
      AND jt.status IS DISTINCT FROM 'rejected'
      AND (jt.expires_at IS NULL OR jt.expires_at > now())
    ORDER BY jt.created_at DESC
    LIMIT 1;

    IF v_token_id IS NULL THEN
      RAISE EXCEPTION 'Invalid or inactive judge token.';
    END IF;
  END IF;

  INSERT INTO public.judge_activity_logs (
    tenant_id,
    judge_id,
    schedule_id,
    token_id,
    action_type,
    action_details,
    actor_user_id,
    actor_type
  ) VALUES (
    p_tenant_id,
    p_judge_id,
    p_schedule_id,
    v_token_id,
    upper(trim(p_action_type)),
    COALESCE(p_action_details, '{}'::jsonb),
    auth.uid(),
    CASE WHEN v_is_admin THEN 'admin' ELSE 'judge' END
  );
END;
$$;


ALTER FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb", "p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_email_by_username"("p_username" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_email text;
BEGIN
  -- Strict input validation to prevent abuse/errors
  IF p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,40}$' THEN
    RETURN NULL;
  END IF;

  SELECT lower(admin_email) INTO v_email
  FROM public.organisations
  WHERE lower(admin_email) = lower(p_username)
  LIMIT 1;

  IF FOUND THEN
    -- Construct the exact synthetic email suffix logic used by the backend.
    -- Wait, the backend uses `${username}_${uuid}@sahi.local` for child!
    -- Ah! organisations.admin_email currently stores the username for child orgs?
    -- Let's check `finalise_child_organisation_provisioning` in 099.
    -- "VALUES (v_new_tenant_id, p_org_name, p_org_type, p_parent_id, p_username)"
    -- Yes! `organisations.admin_email` stores the USERNAME (`p_username`).
    -- Wait, how does it get the full synthetic email then?
    -- The Edge function uses `${username}_${uuid}@sahi.local` for `createUser(email)`.
    -- So `auth.users` has the `.local` email. `organisations` has the username.
    -- Wait, if `organisations` only has the username, how do we lookup the `.local` email?
    -- We must look it up in `auth.users`!
    -- But `auth.users` has many `.local` emails. We need to find the one matching `username_%@sahi.local`.
    RETURN (
      SELECT email 
      FROM auth.users 
      WHERE email LIKE lower(p_username) || '\_%@sahi.local' 
      ORDER BY created_at DESC 
      LIMIT 1
    );
  END IF;

  RETURN NULL;
END;
$_$;


ALTER FUNCTION "public"."lookup_email_by_username"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_schedule_venue_overlap"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.venue_id IS NOT NULL AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.schedules s
       WHERE s.id IS DISTINCT FROM NEW.id
         AND s.tenant_id = NEW.tenant_id
         AND s.festival_id = NEW.festival_id
         AND s.venue_id = NEW.venue_id
         AND s.start_time < NEW.end_time
         AND s.end_time > NEW.start_time
     ) THEN
    RAISE EXCEPTION 'The selected venue already has an overlapping schedule in this festival.'
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_schedule_venue_overlap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preview_bulk_unit_assignment"("p_participant_ids" "uuid"[], "p_target_unit_id" "uuid", "p_tenant_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "chest_number" "text", "category_code" "text", "organisation_id" "uuid", "is_locked" boolean, "lock_scope" "text", "lock_reason" "text", "integrity_hash" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
BEGIN
  -- Verify target organisation belongs to the selected tenant hierarchy
  IF NOT (
    public.is_superadmin() OR 
    EXISTS (SELECT 1 FROM public.get_visible_organisations(p_tenant_id) WHERE id = p_target_unit_id)
  ) THEN
    RAISE EXCEPTION 'Target organisation does not belong to the selected tenant hierarchy';
  END IF;

  -- Verify caller manages target organisation
  IF NOT (public.is_superadmin() OR public.is_org_visible(p_target_unit_id)) THEN
    RAISE EXCEPTION 'Permission denied: Cannot read target organisation';
  END IF;

  RETURN QUERY
  SELECT 
    p.id, 
    p.name, 
    p.chest_number, 
    p.category_code, 
    p.organisation_id, 
    p.is_locked,
    p.lock_scope,
    p.lock_reason,
    md5(
      coalesce(p.id::text, '') || 
      coalesce(p.updated_at::text, '') || 
      coalesce(p.name, '') || 
      coalesce(p.chest_number, '') || 
      coalesce(p.category_code, '') || 
      coalesce(p.organisation_id::text, '')
    ) AS integrity_hash
  FROM participants p
  WHERE p.id = any(p_participant_ids)
  AND (
    public.is_superadmin() OR 
    p.organisation_id IS NULL OR
    EXISTS (SELECT 1 FROM public.get_visible_organisations(p_tenant_id) WHERE id = p.organisation_id)
  );
END;
$$;


ALTER FUNCTION "public"."preview_bulk_unit_assignment"("p_participant_ids" "uuid"[], "p_target_unit_id" "uuid", "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_provisioning_event"("p_operation_type" "text", "p_idempotency_key" "text", "p_status" "text", "p_requested_by" "uuid" DEFAULT NULL::"uuid", "p_target_organisation_id" "uuid" DEFAULT NULL::"uuid", "p_target_tenant_id" "uuid" DEFAULT NULL::"uuid", "p_target_user_id" "uuid" DEFAULT NULL::"uuid", "p_admin_email" "text" DEFAULT NULL::"text", "p_failure_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_op_id uuid;
BEGIN
  IF p_operation_type NOT IN ('root_tenant', 'child_organisation') THEN
    RAISE EXCEPTION 'Invalid operation type';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  IF p_status NOT IN ('pending', 'validated', 'auth_user_created',
                      'database_linked', 'completed', 'failed',
                      'compensation_pending', 'compensated') THEN
    RAISE EXCEPTION 'Invalid provisioning status';
  END IF;

  v_op_id := public._provisioning_upsert_op(
    p_operation_type, p_idempotency_key, p_status,
    p_requested_by, p_target_organisation_id, p_target_tenant_id,
    p_target_user_id, p_admin_email, p_failure_code
  );

  RETURN jsonb_build_object('success', true, 'operation_id', v_op_id);
END;
$$;


ALTER FUNCTION "public"."record_provisioning_event"("p_operation_type" "text", "p_idempotency_key" "text", "p_status" "text", "p_requested_by" "uuid", "p_target_organisation_id" "uuid", "p_target_tenant_id" "uuid", "p_target_user_id" "uuid", "p_admin_email" "text", "p_failure_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."regenerate_festival_chest_numbers"("p_festival_id" "uuid") RETURNS TABLE("participant_count" integer, "category_range" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_festival_tenant uuid;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_festival_tenant FROM public.festival_calendar WHERE id = p_festival_id;

  IF NOT FOUND OR v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE
     AND (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can regenerate chest numbers.';
  END IF;

  RETURN QUERY SELECT * FROM public.regenerate_festival_chest_numbers_internal(p_festival_id, v_actor.id);
END;
$$;


ALTER FUNCTION "public"."regenerate_festival_chest_numbers"("p_festival_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."regenerate_festival_chest_numbers_internal"("p_festival_id" "uuid", "p_actor_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("participant_count" integer, "category_range" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_range integer;
  v_missing_category_count integer;
  v_oversized_category text;
  v_participant_count integer;
BEGIN
  SELECT f.tenant_id, f.chest_number_category_range
    INTO v_tenant_id, v_range
  FROM public.festival_calendar f
  WHERE f.id = p_festival_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Festival not found.';
  END IF;

  SELECT count(*) INTO v_missing_category_count
  FROM public.participants p
  WHERE p.festival_id = p_festival_id
    AND (p.category_code IS NULL OR btrim(p.category_code) = '');
  IF v_missing_category_count > 0 THEN
    RAISE EXCEPTION 'Cannot regenerate: % participant(s) do not have a category.', v_missing_category_count;
  END IF;

  WITH category_counts AS (
    SELECT lower(btrim(p.category_code)) AS category_code, count(*) AS cat_count
    FROM public.participants p
    WHERE p.festival_id = p_festival_id
    GROUP BY lower(btrim(p.category_code))
  )
  SELECT category_code INTO v_oversized_category
  FROM category_counts
  WHERE cat_count > v_range
  ORDER BY category_code
  LIMIT 1;
  IF v_oversized_category IS NOT NULL THEN
    RAISE EXCEPTION 'Category % has more than % participants. Change the festival range to Under 1000 first.', v_oversized_category, v_range;
  END IF;

  DROP TABLE IF EXISTS chest_number_plan;
  CREATE TEMP TABLE chest_number_plan (
    participant_id uuid PRIMARY KEY,
    new_chest_number text NOT NULL UNIQUE
  ) ON COMMIT DROP;

  INSERT INTO chest_number_plan (participant_id, new_chest_number)
  WITH category_order AS (
    SELECT
      lower(btrim(p.category_code)) AS category_code,
      dense_rank() OVER (
        ORDER BY
          fc.sort_order NULLS LAST,
          lower(btrim(p.category_code))
      ) AS category_position
    FROM public.participants p
    LEFT JOIN public.festival_categories fc
      ON fc.festival_id = p_festival_id
     AND lower(fc.code) = lower(btrim(p.category_code))
    WHERE p.festival_id = p_festival_id
    GROUP BY p.category_code, fc.sort_order
  ), ranked_participants AS (
    SELECT
      p.id AS participant_id,
      co.category_position,
      row_number() OVER (
        PARTITION BY lower(btrim(p.category_code))
        ORDER BY
          NULLIF(regexp_replace(COALESCE(p.chest_number, ''), '[^0-9]', '', 'g'), '')::integer NULLS LAST,
          lower(p.name),
          p.id
      ) AS category_row
    FROM public.participants p
    JOIN category_order co ON co.category_code = lower(btrim(p.category_code))
    WHERE p.festival_id = p_festival_id
  )
  SELECT participant_id, ((category_position * v_range) + category_row - 1)::text
  FROM ranked_participants;

  -- Move old values out of the unique index namespace before applying final
  -- numeric values. The temporary values never leave this transaction.
  UPDATE public.participants p
  SET chest_number = '__regen__' || p.id::text
  WHERE p.festival_id = p_festival_id;

  UPDATE public.participants p
  SET chest_number = plan.new_chest_number
  FROM chest_number_plan plan
  WHERE p.id = plan.participant_id;

  GET DIAGNOSTICS v_participant_count = ROW_COUNT;

  INSERT INTO public.chest_number_regeneration_audits
    (tenant_id, festival_id, category_range, participant_count, regenerated_by)
  VALUES (v_tenant_id, p_festival_id, v_range, v_participant_count, p_actor_id);

  RETURN QUERY SELECT v_participant_count, v_range;
END;
$$;


ALTER FUNCTION "public"."regenerate_festival_chest_numbers_internal"("p_festival_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_festival_template_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.festival_template IS DISTINCT FROM OLD.festival_template THEN
    RAISE EXCEPTION 'festival_calendar.festival_template is immutable; template conversion is not available in the current release';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."reject_festival_template_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_judge_login"("p_token_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
BEGIN
  SELECT jt.*
  INTO v_token
  FROM public.judge_tokens jt
  WHERE jt.id = p_token_id
  FOR UPDATE;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Login request not found.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_token.tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to reject this request.';
  END IF;

  IF v_token.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This login request is no longer pending.';
  END IF;

  UPDATE public.judge_tokens
  SET status = 'rejected',
      is_revoked = true,
      revoked_at = now(),
      revoked_by = auth.uid(),
      revocation_reason = 'Login request rejected by administrator'
  WHERE id = p_token_id;
END;
$$;


ALTER FUNCTION "public"."reject_judge_login"("p_token_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_schedule_judge"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_force" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_has_final_marks boolean;
BEGIN
  SELECT a.tenant_id
  INTO v_tenant_id
  FROM public.schedule_judge_assignments a
  WHERE a.schedule_id = p_schedule_id
    AND a.judge_id = p_judge_id
    AND a.status = 'active'
  FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'This judge is not actively assigned to the event.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to modify this judge panel.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.mark_entries me
    WHERE me.schedule_id = p_schedule_id
      AND me.judge_id = p_judge_id
      AND me.is_final = true
  )
  INTO v_has_final_marks;

  IF v_has_final_marks AND NOT p_force THEN
    RAISE EXCEPTION
      'FINAL_MARKS_CONFIRMATION_REQUIRED: This judge has submitted final marks.';
  END IF;

  UPDATE public.schedule_judge_assignments
  SET status = 'removed',
      removed_at = now(),
      removed_by = auth.uid(),
      removal_reason = CASE
        WHEN v_has_final_marks
          THEN 'Force removed by administrator after final marks submission'
        ELSE 'Removed by administrator'
      END
  WHERE schedule_id = p_schedule_id
    AND judge_id = p_judge_id
    AND status = 'active';

  UPDATE public.judge_tokens
  SET is_revoked = true,
      revoked_at = now(),
      revoked_by = auth.uid(),
      revocation_reason = 'Judge removed from event panel',
      status = CASE
        WHEN status IN ('created', 'pending_approval', 'approved')
          THEN 'rejected'
        ELSE status
      END
  WHERE schedule_id = p_schedule_id
    AND judge_id = p_judge_id
    AND is_used = false
    AND is_revoked IS NOT TRUE;

  RETURN jsonb_build_object(
    'removed', true,
    'had_final_marks', v_has_final_marks
  );
END;
$$;


ALTER FUNCTION "public"."remove_schedule_judge"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_judge_login"("p_token" "text", "p_device_id" "text" DEFAULT NULL::"text", "p_device_info" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
  v_auto_approve boolean := false;
  v_new_status text := 'pending_approval';
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'Access code is required.';
  END IF;

  SELECT jt.*
  INTO v_token
  FROM public.judge_tokens jt
  WHERE (
      jt.token_hash = encode(
        extensions.digest(upper(trim(p_token)), 'sha256'),
        'hex'
      )
      OR jt.token = upper(trim(p_token))
    )
    AND jt.is_used = false
    AND jt.is_revoked IS NOT TRUE
    AND jt.status IS DISTINCT FROM 'rejected'
    AND (jt.expires_at IS NULL OR jt.expires_at > now())
  ORDER BY jt.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or rejected access code.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = v_token.schedule_id
      AND a.judge_id = v_token.judge_id
      AND a.tenant_id = v_token.tenant_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This judge is no longer assigned to the event.';
  END IF;

  -- Check for auto-approval if device_id is provided
  IF p_device_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.judge_tokens
      WHERE judge_id = v_token.judge_id
        AND device_id = p_device_id
        AND (status = 'approved' OR is_used = true)
        AND id <> v_token.id
    ) INTO v_auto_approve;
  END IF;

  IF v_auto_approve THEN
    v_new_status := 'approved';
  ELSIF v_token.status = 'approved' THEN
    v_new_status := 'approved';
  END IF;

  UPDATE public.judge_tokens
  SET status = v_new_status,
      device_id = COALESCE(p_device_id, device_id),
      device_info = COALESCE(p_device_info, device_info)
  WHERE id = v_token.id;

  -- Log the auto-approval if it just happened
  IF v_auto_approve AND v_token.status <> 'approved' THEN
    INSERT INTO public.judge_activity_logs (
      tenant_id,
      judge_id,
      schedule_id,
      token_id,
      action_type,
      action_details,
      actor_user_id
    ) VALUES (
      v_token.tenant_id,
      v_token.judge_id,
      v_token.schedule_id,
      v_token.id,
      'auto_approved_by_device',
      jsonb_build_object('device_id', p_device_id, 'device_info', p_device_info),
      v_token.judge_id
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_token.id,
    'status', v_new_status
  );
END;
$$;


ALTER FUNCTION "public"."request_judge_login"("p_token" "text", "p_device_id" "text", "p_device_info" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_schedule_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.start_time IS DISTINCT FROM OLD.start_time THEN
        NEW.notification_sent = FALSE;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."reset_schedule_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_category"("p_class_std" integer, "p_dob" "date", "p_education_type" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  v_age    int;
  v_cutoff date := '2025-05-31';
BEGIN
  -- 1. CAMPUS override
  IF lower(p_education_type) IN ('degree','pg','iti','polytechnic','poly','ded','bed') THEN
    RETURN 'CAMPUS';
  END IF;

  -- 2. Age-based override
  IF p_dob IS NOT NULL THEN
    v_age := date_part('year', age(v_cutoff, p_dob));

    IF v_age >= 15 AND v_age <= 20 THEN RETURN 'JUNIOR'; END IF;
    IF v_age >= 21 AND v_age <= 25 THEN RETURN 'SENIOR'; END IF;
  END IF;

  -- 3. Class-based fallback
  IF p_class_std BETWEEN 1  AND 4  THEN RETURN 'LP';  END IF;
  IF p_class_std BETWEEN 5  AND 7  THEN RETURN 'UP';  END IF;
  IF p_class_std BETWEEN 8  AND 10 THEN RETURN 'HS';  END IF;
  IF p_class_std BETWEEN 11 AND 12 THEN RETURN 'HSS'; END IF;

  -- Cannot determine
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."resolve_category"("p_class_std" integer, "p_dob" "date", "p_education_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_festival_template"("p_festival_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_template text;
BEGIN
  IF p_festival_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT fc.festival_template INTO v_template
  FROM public.festival_calendar fc
  WHERE fc.id = p_festival_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Festival % not found while resolving festival template', p_festival_id;
  END IF;

  IF v_template IS NULL OR v_template NOT IN ('sahithyolsav', 'college_fest') THEN
    RAISE EXCEPTION 'Unexpected festival template % for festival %', v_template, p_festival_id;
  END IF;

  RETURN v_template;
END;
$$;


ALTER FUNCTION "public"."resolve_festival_template"("p_festival_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."resolve_festival_template"("p_festival_id" "uuid") IS 'Narrowly scoped SECURITY DEFINER resolver (Migration 103): returns the authoritative festival_calendar.festival_template for a festival id, independent of caller RLS. NULL input returns NULL; non-null unknown festivals and unexpected/null templates raise (fail closed). Direct execution revoked; trigger-internal use only.';



CREATE OR REPLACE FUNCTION "public"."resolve_item_categories"("p_item_id" "uuid") RETURNS "text"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_categories text[];
BEGIN
  IF p_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT i.category_codes INTO v_categories
  FROM public.items i
  WHERE i.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item % not found while resolving item categories', p_item_id;
  END IF;

  RETURN v_categories;
END;
$$;


ALTER FUNCTION "public"."resolve_item_categories"("p_item_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."resolve_item_categories"("p_item_id" "uuid") IS 'Narrowly scoped SECURITY DEFINER resolver (Migration 104): returns items.category_codes for an item id, independent of caller RLS. NULL input returns NULL; non-null unknown ids raise (fail closed). Direct execution revoked; trigger-internal use only.';



CREATE OR REPLACE FUNCTION "public"."resolve_login_email"("p_username" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_username text := lower(btrim(p_username));
  v_pattern text;
  v_match_count integer;
  v_email text;
BEGIN
  IF v_username IS NULL OR v_username !~ '^[a-z0-9_]{3,40}$' THEN
    RETURN NULL;
  END IF;

  v_pattern := replace(replace(replace(v_username, '\', '\\'), '%', '\%'), '_', '\_')
               || '\_%@sahi.local';

  SELECT count(*), min(lower(email))
    INTO v_match_count, v_email
  FROM auth.users
  WHERE lower(email) LIKE v_pattern ESCAPE '\';

  IF v_match_count <> 1 THEN
    RETURN NULL;
  END IF;

  RETURN v_email;
END;
$_$;


ALTER FUNCTION "public"."resolve_login_email"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_participant_category"("p_participant_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_category text;
BEGIN
  IF p_participant_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.category_code INTO v_category
  FROM public.participants p
  WHERE p.id = p_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found while resolving participant category', p_participant_id;
  END IF;

  RETURN v_category;
END;
$$;


ALTER FUNCTION "public"."resolve_participant_category"("p_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."resolve_participant_category"("p_participant_id" "uuid") IS 'Narrowly scoped SECURITY DEFINER resolver (Migration 104): returns participants.category_code for a participant id, independent of caller RLS. NULL input returns NULL; non-null unknown ids raise (fail closed). Direct execution revoked; trigger-internal use only.';



CREATE OR REPLACE FUNCTION "public"."resolve_reset_target"("p_actor_id" "uuid", "p_target_type" "text", "p_organisation_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_actor_tenant public.tenants%ROWTYPE;
  v_actor_org public.organisations%ROWTYPE;
  v_target public.organisations%ROWTYPE;
  v_target_tenant public.tenants%ROWTYPE;
  v_is_descendant boolean := false;
  v_admin_count integer;
  v_admin_user_id uuid;
  v_auth_email text;
  v_login_identifier text;
BEGIN
  IF p_actor_id IS NULL OR p_organisation_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  IF p_target_type NOT IN ('root_admin', 'child_admin') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_TARGET_TYPE');
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = p_actor_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_target
  FROM public.organisations
  WHERE id = p_organisation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_target.tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_LINKED');
  END IF;

  SELECT * INTO v_target_tenant
  FROM public.tenants
  WHERE id = v_target.tenant_id;

  -- Every reset target must have an exact two-way tenant/organisation link.
  IF NOT FOUND OR v_target_tenant.organisation_id IS DISTINCT FROM v_target.id THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_LINKED');
  END IF;

  -- Target type must describe the actual hierarchy position.
  IF (p_target_type = 'root_admin' AND v_target.parent_id IS NOT NULL)
     OR (p_target_type = 'child_admin' AND v_target.parent_id IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'code', 'TARGET_TYPE_MISMATCH');
  END IF;

  IF COALESCE(v_actor.is_superadmin, false) THEN
    -- Explicit recovery policy: superadmins may reset disabled or archived
    -- root/child tenant admins. Superadmin accounts remain ineligible below.
    NULL;
  ELSE
    -- The actual profiles CHECK constraint supports only `admin` as the
    -- privileged tenant role; admin_leader is not a valid project role.
    IF v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    END IF;

    SELECT * INTO v_actor_tenant
    FROM public.tenants
    WHERE id = v_actor.tenant_id;

    IF NOT FOUND OR COALESCE(v_actor_tenant.access_disabled, false) THEN
      RETURN jsonb_build_object('success', false, 'code', 'DISABLED');
    END IF;

    -- Deterministic caller organisation: use tenants.organisation_id, and
    -- verify the reciprocal link. Never resolve by tenant_id + LIMIT 1.
    SELECT * INTO v_actor_org
    FROM public.organisations
    WHERE id = v_actor_tenant.organisation_id
      AND tenant_id = v_actor_tenant.id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    END IF;

    IF v_actor_org.archived_at IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARCHIVED');
    END IF;

    IF p_target_type = 'root_admin' THEN
      RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    END IF;

    -- All descendant depths are intentionally supported. The target's
    -- ancestor chain must contain the caller; self, sibling, parent/ancestor,
    -- and unrelated organisations therefore fail.
    WITH RECURSIVE ancestor_chain AS (
      SELECT o.id, o.parent_id, ARRAY[o.id]::uuid[] AS visited
      FROM public.organisations AS o
      WHERE o.id = v_target.id
      UNION ALL
      SELECT parent.id, parent.parent_id, chain.visited || parent.id
      FROM public.organisations AS parent
      JOIN ancestor_chain AS chain ON parent.id = chain.parent_id
      WHERE NOT parent.id = ANY(chain.visited)
    )
    SELECT EXISTS (
      SELECT 1 FROM ancestor_chain
      WHERE id = v_actor_org.id AND id <> v_target.id
    ) INTO v_is_descendant;

    IF NOT v_is_descendant THEN
      RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    END IF;

    IF v_target.archived_at IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARCHIVED');
    END IF;

    IF COALESCE(v_target_tenant.access_disabled, false) THEN
      RETURN jsonb_build_object('success', false, 'code', 'DISABLED');
    END IF;
  END IF;

  SELECT count(*)
    INTO v_admin_count
  FROM public.profiles
  WHERE tenant_id = v_target_tenant.id
    AND role = 'admin'
    AND NOT COALESCE(is_superadmin, false);

  IF v_admin_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_ADMIN');
  ELSIF v_admin_count > 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'AMBIGUOUS_ADMIN');
  END IF;

  SELECT id INTO v_admin_user_id
  FROM public.profiles
  WHERE tenant_id = v_target_tenant.id
    AND role = 'admin'
    AND NOT COALESCE(is_superadmin, false);

  SELECT lower(email) INTO v_auth_email
  FROM auth.users
  WHERE id = v_admin_user_id;

  IF NOT FOUND OR v_auth_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_AUTH_USER');
  END IF;

  -- Child admins log in with the public username, not the synthetic email.
  v_login_identifier := CASE
    WHEN p_target_type = 'child_admin' THEN lower(btrim(v_target.admin_email))
    ELSE v_auth_email
  END;

  IF v_login_identifier IS NULL OR v_login_identifier = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_LOGIN_IDENTIFIER');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_admin_user_id,
    'actor_tenant_id', v_actor.tenant_id,
    'tenant_id', v_target_tenant.id,
    'organisation_id', v_target.id,
    'login_identifier', v_login_identifier,
    'username', CASE WHEN p_target_type = 'child_admin' THEN v_login_identifier ELSE NULL END,
    'target_type', p_target_type
  );
END;
$$;


ALTER FUNCTION "public"."resolve_reset_target"("p_actor_id" "uuid", "p_target_type" "text", "p_organisation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_child_organisation"("p_org_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_was_archived boolean;
BEGIN
  PERFORM public._assert_organisation_hierarchy_access(p_org_id);

  SELECT o.tenant_id, o.archived_at IS NOT NULL
    INTO v_tenant_id, v_was_archived
  FROM public.organisations o
  WHERE o.id = p_org_id;

  -- Idempotent: no-op when already restored.
  IF NOT v_was_archived THEN
    RETURN jsonb_build_object(
      'success', true,
      'org_id', p_org_id,
      'state', 'active',
      'message', 'Organisation was not archived'
    );
  END IF;

  UPDATE public.organisations
    SET archived_at = NULL
  WHERE id = p_org_id;

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(),
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_tenant_id, p_org_id,
    'child_organisation_restored', p_reason,
    jsonb_build_object('archived_at', v_was_archived),
    jsonb_build_object('archived_at', NULL),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'org_id', p_org_id,
    'state', 'active',
    'message', 'Organisation restored and visible again.'
  );
END;
$$;


ALTER FUNCTION "public"."restore_child_organisation"("p_org_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_page_snapshot"("p_snapshot_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_snapshot    record;
  v_page        jsonb;
  v_caller_email text;
  v_restore_count int := 0;
BEGIN
  -- Only superadmins can restore
  IF NOT public.is_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only superadmins can restore snapshots');
  END IF;

  -- Fetch snapshot
  SELECT * INTO v_snapshot FROM page_snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Snapshot not found');
  END IF;

  -- Save a new snapshot before restoring (so you can undo the restore)
  PERFORM public.create_page_snapshot('AUTO_PRE_RESTORE');

  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();

  -- Restore each page's status from the snapshot
  FOR v_page IN SELECT * FROM jsonb_array_elements(v_snapshot.snapshot_data) LOOP
    UPDATE system_pages
    SET status     = (v_page->>'status'),
        updated_by = auth.uid(),
        updated_at = now()
    WHERE page_key = (v_page->>'page_key');

    IF FOUND THEN
      v_restore_count := v_restore_count + 1;

      -- Audit log
      INSERT INTO page_audit_logs (page_key, page_name, action, new_status, performed_by, performed_by_email, notes)
      VALUES (
        v_page->>'page_key',
        v_page->>'page_name',
        'SNAPSHOT_RESTORED',
        v_page->>'status',
        auth.uid(),
        v_caller_email,
        'Restored from snapshot: ' || v_snapshot.snapshot_name
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'restored_count', v_restore_count,
    'snapshot_name', v_snapshot.snapshot_name
  );
END;
$$;


ALTER FUNCTION "public"."restore_page_snapshot"("p_snapshot_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_tenant_access"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Permission denied: superadmin access required';
  END IF;

  v_result := public.disable_tenant_access(
    p_org_id,
    'Legacy revoke_tenant_access compatibility call'
  );

  IF (v_result->>'success') = 'true' THEN
    INSERT INTO public.tenant_access_audit_logs (
      actor_user_id, actor_role, target_tenant_id, target_organisation_id,
      action, reason, success
    ) VALUES (
      v_uid, 'superadmin',
      (v_result->>'tenant_id')::uuid, p_org_id,
      'legacy_revoke_redirected',
      'Legacy revoke_tenant_access redirected to safe disable',
      true
    );
  END IF;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."revoke_tenant_access"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_termination"("p_participant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Verify the caller is an admin
  IF NOT (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('tenant_admin', 'festival_admin', 'admin')
  )) THEN
    RAISE EXCEPTION 'Only administrators can revoke participant termination.';
  END IF;

  UPDATE public.participants
  SET is_terminated = false,
      termination_reason = NULL,
      updated_at = now()
  WHERE id = p_participant_id;
END;
$$;


ALTER FUNCTION "public"."revoke_termination"("p_participant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rollback_unit_assignment"("p_batch_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_log record;
  v_reverted_count int := 0;
  v_skipped_count int := 0;
  v_batch_status text;
  v_changed_by uuid;
  v_skip_reasons jsonb := '[]'::jsonb;
BEGIN
  -- Get active user ID
  v_changed_by := auth.uid();

  -- 1. Check if the batch is already rolled back
  SELECT status INTO v_batch_status FROM participant_unit_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_batch_status = 'rolled_back' THEN
    RAISE EXCEPTION 'Rollback failed: Batch has already been rolled back';
  END IF;

  -- 2. Loop through the audit logs for this batch (FOR UPDATE SKIP LOCKED)
  FOR v_log IN 
    SELECT l.id, l.participant_id, l.old_unit_id, l.new_unit_id, p.name, p.is_locked, p.lock_scope, p.lock_reason
    FROM participant_unit_audit_logs l
    JOIN participants p ON p.id = l.participant_id
    WHERE l.batch_id = p_batch_id AND l.is_reverted = false
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Double check if participant is locked
    IF v_log.is_locked THEN
      v_skipped_count := v_skipped_count + 1;
      -- Append to reasons
      v_skip_reasons := v_skip_reasons || jsonb_build_object(
        'participant_id', v_log.participant_id,
        'name', v_log.name,
        'reason', coalesce(v_log.lock_reason, 'Locked') || ' (' || coalesce(v_log.lock_scope, 'all') || ')'
      );
      CONTINUE;
    END IF;

    -- Update participant back to old unit and its tenant
    UPDATE participants
    SET organisation_id = v_log.old_unit_id,
        tenant_id = (SELECT tenant_id FROM organisations WHERE id = v_log.old_unit_id),
        updated_at = now()
    WHERE id = v_log.participant_id;

    -- Update registrations back to old unit and its tenant
    UPDATE registrations
    SET organisation_id = v_log.old_unit_id,
        tenant_id = (SELECT tenant_id FROM organisations WHERE id = v_log.old_unit_id)
    WHERE participant_id = v_log.participant_id;

    -- Touch old and new organisations to trigger realtime / cache bump
    IF v_log.old_unit_id IS NOT NULL THEN
      UPDATE organisations SET name = name WHERE id = v_log.old_unit_id;
    END IF;
    IF v_log.new_unit_id IS NOT NULL THEN
      UPDATE organisations SET name = name WHERE id = v_log.new_unit_id;
    END IF;

    -- Mark this specific audit log row as reverted
    UPDATE participant_unit_audit_logs
    SET is_reverted = true,
        reverted_at = now(),
        reverted_by = v_changed_by
    WHERE id = v_log.id;

    v_reverted_count := v_reverted_count + 1;
  END LOOP;

  -- 3. Update the batch status
  UPDATE participant_unit_batches
  SET status = CASE 
                 WHEN v_skipped_count > 0 THEN 'partial'
                 ELSE 'rolled_back'
               END,
      rolled_back_at = now(),
      completed_at = now(),
      skipped_count = v_skipped_count,
      skip_reasons = v_skip_reasons
  WHERE id = p_batch_id;

  -- Log system event
  INSERT INTO system_events (
    event_type,
    event_metadata,
    created_by,
    tenant_id
  )
  SELECT 
    CASE WHEN v_skipped_count > 0 THEN 'ROLLBACK_PARTIAL' ELSE 'ROLLBACK_COMPLETED' END,
    jsonb_build_object(
      'batch_id', p_batch_id,
      'reverted_count', v_reverted_count,
      'skipped_count', v_skipped_count,
      'skip_reasons', v_skip_reasons
    ),
    v_changed_by,
    tenant_id
  FROM participant_unit_batches
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'reverted_count', v_reverted_count,
    'skipped_count', v_skipped_count,
    'skip_reasons', v_skip_reasons
  );
END;
$$;


ALTER FUNCTION "public"."rollback_unit_assignment"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_delete_schedule"("p_schedule_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_dependencies jsonb := '[]'::jsonb;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (COALESCE(v_profile.is_superadmin, false) IS FALSE
      AND v_profile.role NOT IN ('admin', 'admin_leader')) THEN
    RAISE EXCEPTION 'Only festival administrators can delete schedules.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id
    AND (COALESCE(v_profile.is_superadmin, false) OR s.tenant_id = v_profile.tenant_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'schedule_id', p_schedule_id);
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.mark_entries me WHERE me.schedule_id = v_schedule.id;
  IF v_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('judge_marks'); END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.results r
  WHERE r.tenant_id = v_schedule.tenant_id
    AND r.festival_id = v_schedule.festival_id
    AND (r.schedule_id = v_schedule.id OR (r.schedule_id IS NULL AND r.item_id = v_schedule.item_id));
  IF v_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('results_or_points'); END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.attendance a WHERE a.schedule_id = v_schedule.id;
  IF v_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('attendance_or_checkin'); END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.schedule_judge_assignments a WHERE a.schedule_id = v_schedule.id;
  IF v_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('judge_assignments'); END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.registrations r
  WHERE r.tenant_id = v_schedule.tenant_id
    AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id
    AND r.status IS DISTINCT FROM 'rejected'
    AND (COALESCE(r.is_verified, false) OR NULLIF(trim(COALESCE(r.code_letter, '')), '') IS NOT NULL);
  IF v_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('stage_status_or_code_letters'); END IF;

  IF jsonb_array_length(v_dependencies) > 0 THEN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_schedule.tenant_id, auth.uid(), 'DELETE_SCHEDULE_BLOCKED', 'schedules', v_schedule.id,
      to_jsonb(v_schedule), jsonb_build_object('status', 'blocked', 'reason', NULLIF(trim(p_reason), ''), 'dependencies', v_dependencies));
    RETURN jsonb_build_object('status', 'blocked', 'schedule_id', v_schedule.id,
      'message', format('Schedule cannot be deleted because dependent data exists: %s.', array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_dependencies)), ', ')),
      'dependencies', v_dependencies);
  END IF;

  DELETE FROM public.schedules WHERE id = v_schedule.id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_schedule.tenant_id, auth.uid(), 'DELETE_SCHEDULE', 'schedules', v_schedule.id,
    to_jsonb(v_schedule), jsonb_build_object('status', 'removed', 'reason', NULLIF(trim(p_reason), ''), 'removed_at', now()));
  RETURN jsonb_build_object('status', 'removed', 'schedule_id', v_schedule.id);
END;
$$;


ALTER FUNCTION "public"."safe_delete_schedule"("p_schedule_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_delete_venue"("p_venue_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_venue public.venues%ROWTYPE;
  v_schedule_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (COALESCE(v_profile.is_superadmin, false) IS FALSE
      AND v_profile.role NOT IN ('admin', 'admin_leader')) THEN
    RAISE EXCEPTION 'Only festival administrators can delete venues.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_venue FROM public.venues v
  WHERE v.id = p_venue_id
    AND (COALESCE(v_profile.is_superadmin, false) OR v.tenant_id = v_profile.tenant_id)
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found', 'venue_id', p_venue_id); END IF;

  SELECT count(*)::integer INTO v_schedule_count FROM public.schedules s WHERE s.venue_id = v_venue.id;
  IF v_schedule_count > 0 THEN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_venue.tenant_id, auth.uid(), 'DELETE_VENUE_BLOCKED', 'venues', v_venue.id,
      to_jsonb(v_venue), jsonb_build_object('status', 'blocked', 'reason', NULLIF(trim(p_reason), ''), 'schedule_count', v_schedule_count));
    RETURN jsonb_build_object('status', 'blocked', 'venue_id', v_venue.id,
      'message', format('Venue cannot be deleted while %s schedule(s) use it.', v_schedule_count), 'schedule_count', v_schedule_count);
  END IF;

  DELETE FROM public.venues WHERE id = v_venue.id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_venue.tenant_id, auth.uid(), 'DELETE_VENUE', 'venues', v_venue.id,
    to_jsonb(v_venue), jsonb_build_object('status', 'removed', 'reason', NULLIF(trim(p_reason), ''), 'removed_at', now()));
  RETURN jsonb_build_object('status', 'removed', 'venue_id', v_venue.id);
END;
$$;


ALTER FUNCTION "public"."safe_delete_venue"("p_venue_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_unassign_registration"("p_registration_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_registration public.registrations%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_item_name text;
  v_item_code text;
  v_participation_type text;
  v_is_group boolean := false;
  v_mark_count integer := 0;
  v_result_count integer := 0;
  v_published_result_count integer := 0;
  v_attendance_count integer := 0;
  v_group_member_count integer := 0;
  v_dependencies jsonb := '[]'::jsonb;
  v_block_message text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (COALESCE(v_profile.is_superadmin, false) IS FALSE
      AND v_profile.role NOT IN ('admin', 'admin_leader', 'team_leader')) THEN
    RAISE EXCEPTION 'Only festival administrators or team leaders can unassign competition items.'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_registration
  FROM public.registrations r
  WHERE r.id = p_registration_id

  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'registration_id', p_registration_id);
  END IF;

  IF NOT COALESCE(v_profile.is_superadmin, false)
     AND NOT public.is_org_visible(v_registration.organisation_id) THEN
    RAISE EXCEPTION 'Permission denied for this registration' USING ERRCODE = '42501';
  END IF;

  SELECT i.item_name_en, i.item_code, i.participation_type
    INTO v_item_name, v_item_code, v_participation_type
  FROM public.items i
  WHERE i.id = v_registration.item_id
    AND (i.tenant_id IS NULL OR i.tenant_id = v_registration.tenant_id);
  v_is_group := COALESCE(v_participation_type = 'group', false);

  SELECT count(*)::integer INTO v_mark_count
  FROM public.mark_entries me WHERE me.registration_id = v_registration.id;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE COALESCE(res.published, false))::integer
    INTO v_result_count, v_published_result_count
  FROM public.results res WHERE res.registration_id = v_registration.id;

  SELECT count(*)::integer INTO v_attendance_count
  FROM public.attendance a
  JOIN public.schedules s ON s.id = a.schedule_id
  WHERE a.participant_id = v_registration.participant_id
    AND s.item_id = v_registration.item_id
    AND s.festival_id = v_registration.festival_id
    AND s.tenant_id = v_registration.tenant_id
    AND a.tenant_id = v_registration.tenant_id;

  SELECT count(*)::integer INTO v_group_member_count
  FROM public.group_members gm WHERE gm.registration_id = v_registration.id;

  IF v_mark_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('judge_marks'); END IF;
  IF v_result_count > 0 THEN
    v_dependencies := v_dependencies || jsonb_build_array(
      CASE WHEN v_published_result_count > 0 THEN 'published_results_and_points' ELSE 'results_and_points' END);
  END IF;
  IF v_attendance_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('attendance_or_checkin'); END IF;
  IF COALESCE(v_registration.is_verified, false)
     OR NULLIF(trim(COALESCE(v_registration.code_letter, '')), '') IS NOT NULL
    THEN v_dependencies := v_dependencies || jsonb_build_array('stage_status_or_code_letter'); END IF;
  IF v_group_member_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('group_members'); END IF;
  IF v_is_group AND v_registration.raw_group_members IS NOT NULL
     AND jsonb_typeof(v_registration.raw_group_members) = 'array'
     AND jsonb_array_length(v_registration.raw_group_members) > 0
    THEN v_dependencies := v_dependencies || jsonb_build_array('group_registration_snapshot'); END IF;

  IF jsonb_array_length(v_dependencies) > 0 THEN
    v_block_message := format(
      'This %s assignment cannot be removed because competition data already exists: %s. Historical records were preserved.',
      COALESCE(v_item_code, v_item_name, 'item'),
      array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_dependencies)), ', '));
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_registration.tenant_id, auth.uid(), 'UNASSIGN_ITEM_BLOCKED', 'registrations',
      v_registration.id, to_jsonb(v_registration),
      jsonb_build_object('status', 'blocked', 'reason', NULLIF(trim(p_reason), ''),
        'dependencies', v_dependencies, 'participant_id', v_registration.participant_id,
        'item_id', v_registration.item_id, 'festival_id', v_registration.festival_id,
        'organisation_id', v_registration.organisation_id));
    RETURN jsonb_build_object('status', 'blocked', 'message', v_block_message,
      'registration_id', v_registration.id, 'participant_id', v_registration.participant_id,
      'item_id', v_registration.item_id, 'festival_id', v_registration.festival_id,
      'organisation_id', v_registration.organisation_id, 'dependencies', v_dependencies);
  END IF;

  BEGIN
    DELETE FROM public.registrations WHERE id = v_registration.id;
  EXCEPTION WHEN foreign_key_violation THEN
    v_block_message := 'This assignment was not removed because dependent competition history exists. Historical records were preserved.';
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_registration.tenant_id, auth.uid(), 'UNASSIGN_ITEM_BLOCKED', 'registrations',
      v_registration.id, to_jsonb(v_registration),
      jsonb_build_object('status', 'blocked', 'reason', NULLIF(trim(p_reason), ''), 'database_error', SQLERRM));
    RETURN jsonb_build_object('status', 'blocked', 'message', v_block_message,
      'registration_id', v_registration.id);
  END;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_registration.tenant_id, auth.uid(), 'UNASSIGN_ITEM', 'registrations', v_registration.id,
    to_jsonb(v_registration), jsonb_build_object('status', 'removed',
      'reason', NULLIF(trim(p_reason), ''), 'participant_id', v_registration.participant_id,
      'item_id', v_registration.item_id, 'festival_id', v_registration.festival_id,
      'organisation_id', v_registration.organisation_id, 'removed_by', auth.uid(), 'removed_at', now()));

  RETURN jsonb_build_object('status', 'removed', 'registration_id', v_registration.id,
    'participant_id', v_registration.participant_id, 'item_id', v_registration.item_id,
    'festival_id', v_registration.festival_id, 'organisation_id', v_registration.organisation_id);
END;
$$;


ALTER FUNCTION "public"."safe_unassign_registration"("p_registration_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_auth_uid"("uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
          BEGIN
            PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
          END;
          $$;


ALTER FUNCTION "public"."set_auth_uid"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_schedule_judges"("p_schedule_id" "uuid", "p_judge_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_expected_count int;
  v_judge_ids uuid[] := COALESCE(p_judge_ids, ARRAY[]::uuid[]);
  v_removed_judge_ids uuid[];
  v_invalid_count int;
BEGIN
  SELECT s.tenant_id, s.expected_judge_count
  INTO v_tenant_id, v_expected_count
  FROM public.schedules s
  WHERE s.id = p_schedule_id
  FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Schedule not found.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to manage this schedule.';
  END IF;

  IF cardinality(v_judge_ids) <> (
    SELECT COUNT(DISTINCT selected.judge_id)
    FROM unnest(v_judge_ids) AS selected(judge_id)
  ) THEN
    RAISE EXCEPTION 'The panel contains duplicate judges.';
  END IF;

  IF cardinality(v_judge_ids) > v_expected_count THEN
    RAISE EXCEPTION
      'This event requires % judge(s). Remove % extra judge(s) before saving.',
      v_expected_count,
      cardinality(v_judge_ids) - v_expected_count;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_count
  FROM unnest(v_judge_ids) AS selected(selected_judge_id)
  LEFT JOIN public.judges j
    ON j.id = selected.selected_judge_id
   AND j.tenant_id = v_tenant_id
  WHERE j.id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'One or more selected judges do not belong to this tenant.';
  END IF;

  SELECT COALESCE(array_agg(a.judge_id), ARRAY[]::uuid[])
  INTO v_removed_judge_ids
  FROM public.schedule_judge_assignments a
  WHERE a.schedule_id = p_schedule_id
    AND a.status = 'active'
    AND NOT (a.judge_id = ANY(v_judge_ids));

  IF EXISTS (
    SELECT 1
    FROM public.mark_entries me
    WHERE me.schedule_id = p_schedule_id
      AND me.judge_id = ANY(v_removed_judge_ids)
      AND me.is_final = true
  ) THEN
    RAISE EXCEPTION
      'A selected judge has already submitted final marks and cannot be removed from the normal panel editor.';
  END IF;

  UPDATE public.schedule_judge_assignments
  SET status = 'removed',
      removed_at = now(),
      removed_by = auth.uid(),
      removal_reason = 'Removed by administrator'
  WHERE schedule_id = p_schedule_id
    AND status = 'active'
    AND judge_id = ANY(v_removed_judge_ids);

  UPDATE public.judge_tokens
  SET is_revoked = true,
      revoked_at = now(),
      revoked_by = auth.uid(),
      revocation_reason = 'Judge removed from event panel',
      status = CASE
        WHEN status IN ('created', 'pending_approval', 'approved') THEN 'rejected'
        ELSE status
      END
  WHERE schedule_id = p_schedule_id
    AND judge_id = ANY(v_removed_judge_ids)
    AND is_used = false
    AND is_revoked IS NOT TRUE;

  INSERT INTO public.schedule_judge_assignments (
    tenant_id,
    schedule_id,
    judge_id,
    status,
    assigned_at,
    assigned_by,
    removed_at,
    removed_by,
    removal_reason
  )
  SELECT
    v_tenant_id,
    p_schedule_id,
    selected.selected_judge_id,
    'active',
    now(),
    auth.uid(),
    NULL,
    NULL,
    NULL
  FROM unnest(v_judge_ids) AS selected(selected_judge_id)
  ON CONFLICT (schedule_id, judge_id)
  DO UPDATE SET
    status = 'active',
    assigned_at = now(),
    assigned_by = auth.uid(),
    removed_at = NULL,
    removed_by = NULL,
    removal_reason = NULL;

  RETURN jsonb_build_object(
    'schedule_id', p_schedule_id,
    'expected_count', v_expected_count,
    'assigned_count', cardinality(v_judge_ids),
    'remaining_count', GREATEST(v_expected_count - cardinality(v_judge_ids), 0)
  );
END;
$$;


ALTER FUNCTION "public"."set_schedule_judges"("p_schedule_id" "uuid", "p_judge_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."setup_child_organisation"("p_parent_id" "uuid", "p_new_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.finalise_child_organisation_provisioning(
    p_parent_id, p_new_user_id, p_org_name, p_org_type, p_username, NULL
  );
END;
$$;


ALTER FUNCTION "public"."setup_child_organisation"("p_parent_id" "uuid", "p_new_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."setup_child_organisation"("p_parent_id" "uuid", "p_new_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text", "p_internal_email" "text", "p_password_temp" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_parent_tenant_id uuid;
  v_new_tenant_id uuid;
  v_new_org_id uuid;
BEGIN
  SELECT tenant_id INTO v_parent_tenant_id FROM organisations WHERE id = p_parent_id;
  IF NOT (public.is_superadmin() OR v_parent_tenant_id = public.get_my_tenant_id()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied.');
  END IF;

  INSERT INTO tenants (name, org_type, subscription_status)
  VALUES (p_org_name, p_org_type, 'active')
  RETURNING id INTO v_new_tenant_id;

  INSERT INTO organisations (tenant_id, name, org_type, parent_id, admin_email, admin_internal_email, admin_password_temp)
  VALUES (v_new_tenant_id, p_org_name, p_org_type, p_parent_id, p_username, p_internal_email, p_password_temp)
  RETURNING id INTO v_new_org_id;

  INSERT INTO public.profiles (id, full_name, role, tenant_id, is_superadmin)
  VALUES (p_new_user_id, p_org_name || ' Admin', 'admin', v_new_tenant_id, false)
  ON CONFLICT (id) DO UPDATE 
  SET role = 'admin', tenant_id = v_new_tenant_id, full_name = EXCLUDED.full_name;

  RETURN jsonb_build_object('success', true, 'org_id', v_new_org_id, 'tenant_id', v_new_tenant_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."setup_child_organisation"("p_parent_id" "uuid", "p_new_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text", "p_internal_email" "text", "p_password_temp" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."setup_tenant_records"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.finalise_tenant_provisioning(
    p_org_id, p_user_id, p_org_name, p_org_type, NULL
  );
END;
$$;


ALTER FUNCTION "public"."setup_tenant_records"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."setup_tenant_records"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_admin_email" "text" DEFAULT NULL::"text", "p_admin_pass" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM organisations WHERE id = p_org_id AND tenant_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organisation already has a tenant active');
  END IF;

  INSERT INTO tenants (name, org_type, subscription_status)
  VALUES (p_org_name, p_org_type, 'active')
  RETURNING id INTO v_tenant_id;

  UPDATE organisations 
  SET tenant_id = v_tenant_id, admin_email = p_admin_email, admin_password_temp = p_admin_pass
  WHERE id = p_org_id;

  INSERT INTO public.profiles (id, full_name, role, tenant_id, is_superadmin)
  VALUES (p_user_id, p_org_name || ' Admin', 'admin', v_tenant_id, false)
  ON CONFLICT (id) DO UPDATE 
  SET role = 'admin', tenant_id = v_tenant_id, full_name = EXCLUDED.full_name;

  RETURN jsonb_build_object('success', true, 'tenant_id', v_tenant_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."setup_tenant_records"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_admin_email" "text", "p_admin_pass" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slugify_candidate_name"("value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT NULLIF(
    trim(both '-' from regexp_replace(lower(coalesce(value, 'candidate')), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;


ALTER FUNCTION "public"."slugify_candidate_name"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."snapshot_festival_template_from_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_template text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NOT NULL THEN
      SELECT festival_template INTO v_template
      FROM public.tenants
      WHERE id = NEW.tenant_id;

      IF v_template IS NULL THEN
        RAISE EXCEPTION 'Cannot snapshot festival template: owning tenant % not found', NEW.tenant_id;
      END IF;

      NEW.festival_template := v_template;
    ELSE
      NEW.festival_template := 'sahithyolsav';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."snapshot_festival_template_from_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."snapshot_points_config_version"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.config_version IS DISTINCT FROM OLD.config_version THEN
    INSERT INTO public.points_config_versions (
      tenant_id,
      festival_id,
      config_version,
      config_snapshot,
      change_reason,
      created_by
    ) VALUES (
      NEW.tenant_id,
      NEW.festival_id,
      NEW.config_version,
      to_jsonb(NEW),
      NEW.change_reason,
      auth.uid()
    )
    ON CONFLICT (festival_id, config_version)
    DO UPDATE SET
      config_snapshot = EXCLUDED.config_snapshot,
      change_reason = EXCLUDED.change_reason;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."snapshot_points_config_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ssf_calculate_age"("p_dob" "date") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  cutoff date := '2025-05-31';
  age int;
BEGIN
  age := date_part('year', age(cutoff, p_dob));
  RETURN age;
END;
$$;


ALTER FUNCTION "public"."ssf_calculate_age"("p_dob" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ssf_calculate_age"("p_dob" "date", "p_festival_year" integer DEFAULT 2026) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  cutoff date := make_date(p_festival_year, 5, 31);
  age int;
BEGIN
  age := date_part('year', age(cutoff, p_dob));
  RETURN age;
END;
$$;


ALTER FUNCTION "public"."ssf_calculate_age"("p_dob" "date", "p_festival_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ssf_get_category"("p_dob" "date", "p_class_std" integer DEFAULT NULL::integer, "p_education_type" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  age int;
  edu text;
BEGIN
  edu := lower(trim(coalesce(p_education_type, '')));

  -- Priority 1: CAMPUS (CA)
  IF edu IN ('degree', 'pg', 'iti', 'polytechnic', 'poly', 'd.ed', 'ded', 'b.ed', 'bed') THEN
    RETURN 'CA';
  END IF;

  -- Priority 2 & 3: Age-based (requires DOB)
  IF p_dob IS NOT NULL THEN
    age := ssf_calculate_age(p_dob);

    IF age >= 15 AND age <= 20 THEN RETURN 'JR'; END IF;
    IF age >= 21 AND age <= 25 THEN RETURN 'SR'; END IF;
  END IF;

  -- Priority 4: Class-based fallback
  IF p_class_std IS NOT NULL THEN
    IF p_class_std BETWEEN 1  AND 4  THEN RETURN 'LP';  END IF;
    IF p_class_std BETWEEN 5  AND 7  THEN RETURN 'UP';  END IF;
    IF p_class_std BETWEEN 8  AND 10 THEN RETURN 'HS';  END IF;
    IF p_class_std BETWEEN 11 AND 12 THEN RETURN 'HSS'; END IF;
  END IF;

  RETURN NULL; -- Could not determine
END;
$$;


ALTER FUNCTION "public"."ssf_get_category"("p_dob" "date", "p_class_std" integer, "p_education_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ssf_get_category"("p_dob" "date", "p_class_std" integer DEFAULT NULL::integer, "p_education_type" "text" DEFAULT NULL::"text", "p_festival_year" integer DEFAULT 2026) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  edu text;
  junior_limit date;
  senior_limit date;
  young_limit date;
BEGIN
  edu := lower(trim(coalesce(p_education_type, '')));

  -- Priority 1: CAMPUS (Degree/PG overrides everything else)
  IF edu IN ('degree', 'pg', 'iti', 'polytechnic', 'poly', 'd.ed', 'ded', 'b.ed', 'bed') THEN
    RETURN 'CAMPUS';
  END IF;

  -- Priority 2: Class-based fallback (School students get class level even if age falls in Junior/Senior)
  IF p_class_std IS NOT NULL THEN
    IF p_class_std BETWEEN 1  AND 4  THEN RETURN 'LP';  END IF;
    IF p_class_std BETWEEN 5  AND 7  THEN RETURN 'UP';  END IF;
    IF p_class_std BETWEEN 8  AND 10 THEN RETURN 'HS';  END IF;
    IF p_class_std BETWEEN 11 AND 12 THEN RETURN 'HSS'; END IF;
  END IF;

  -- Priority 3: Age-based JUNIOR / SENIOR (Only if no class/campus)
  IF p_dob IS NOT NULL THEN
    junior_limit := make_date(p_festival_year - 20, 5, 31);
    senior_limit := make_date(p_festival_year - 26, 5, 31);
    young_limit := make_date(p_festival_year - 15, 5, 31);

    -- SENIOR first (age 20–25)
    IF p_dob > senior_limit AND p_dob <= junior_limit THEN
      RETURN 'SENIOR';
    END IF;

    -- JUNIOR (age 15–19)
    IF p_dob > junior_limit AND p_dob <= young_limit THEN
      RETURN 'JUNIOR';
    END IF;
  END IF;

  RETURN NULL; -- Could not determine
END;
$$;


ALTER FUNCTION "public"."ssf_get_category"("p_dob" "date", "p_class_std" integer, "p_education_type" "text", "p_festival_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_assert_admin_access"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_role text;
  v_is_superadmin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Stage Management requires an authenticated account.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.tenant_id, p.role, COALESCE(p.is_superadmin, false)
    INTO v_tenant_id, v_role, v_is_superadmin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_tenant_id IS NULL OR (v_role <> 'admin' AND NOT v_is_superadmin) THEN
    RAISE EXCEPTION 'Stage Management is restricted to festival administrators.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_tenant_id;
END;
$$;


ALTER FUNCTION "public"."stage_assert_admin_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_portal_apply_code_letters"("p_token" "text", "p_schedule_id" "uuid", "p_item_id" "uuid", "p_assignments" "jsonb", "p_overwrite" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_tenant_id uuid;
    v_venue_id uuid;
    v_is_shuffle_locked boolean;
BEGIN
    -- Validate token
    SELECT out_tenant_id, out_venue_id INTO v_tenant_id, v_venue_id FROM stage_verify_token(p_token);

    -- Cross-stage validation and lock check
    SELECT is_shuffle_locked INTO v_is_shuffle_locked
    FROM schedules
    WHERE id = p_schedule_id
      AND item_id = p_item_id
      AND venue_id = v_venue_id
      AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized cross-stage mutation or schedule not found';
    END IF;

    IF v_is_shuffle_locked THEN
        RAISE EXCEPTION 'Cannot apply code letters because the shuffle is locked';
    END IF;

    -- Delegate to the base apply_stage_code_letters RPC securely
    RETURN apply_stage_code_letters(
        p_schedule_id := p_schedule_id,
        p_item_id := p_item_id,
        p_tenant_id := v_tenant_id,
        p_assignments := p_assignments,
        p_overwrite := p_overwrite
    );
END;
$$;


ALTER FUNCTION "public"."stage_portal_apply_code_letters"("p_token" "text", "p_schedule_id" "uuid", "p_item_id" "uuid", "p_assignments" "jsonb", "p_overwrite" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_portal_get_registrations"("p_token" "text", "p_item_id" "uuid") RETURNS TABLE("id" "uuid", "participant_id" "uuid", "item_id" "uuid", "organisation_id" "uuid", "status" "text", "is_verified" boolean, "code_letter" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "tenant_id" "uuid", "participants" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_tenant_id uuid;
    v_venue_id uuid;
BEGIN
    -- Validate token
    SELECT out_tenant_id, out_venue_id INTO v_tenant_id, v_venue_id FROM stage_verify_token(p_token);

    RETURN QUERY
    SELECT 
        r.id, r.participant_id, r.item_id, r.organisation_id, r.status, 
        r.is_verified, r.code_letter, r.created_at, r.updated_at, r.tenant_id,
        jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'chest_number', p.chest_number
        ) as participants
    FROM registrations r
    JOIN participants p ON p.id = r.participant_id
    WHERE r.item_id = p_item_id
      AND r.tenant_id = v_tenant_id
      AND r.status != 'rejected';
END;
$$;


ALTER FUNCTION "public"."stage_portal_get_registrations"("p_token" "text", "p_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_portal_update_registration"("p_token" "text", "p_reg_id" "uuid", "p_is_verified" boolean DEFAULT NULL::boolean, "p_code_letter" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_tenant_id uuid;
    v_venue_id uuid;
    v_valid boolean;
BEGIN
    -- Validate token
    SELECT out_tenant_id, out_venue_id INTO v_tenant_id, v_venue_id FROM stage_verify_token(p_token);

    -- Cross-stage validation
    SELECT true INTO v_valid
    FROM schedules s
    JOIN registrations r ON r.item_id = s.item_id
    WHERE r.id = p_reg_id
      AND s.venue_id = v_venue_id
      AND s.tenant_id = v_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized cross-stage mutation';
    END IF;

    -- Update registration explicitly allowing only specific fields
    UPDATE registrations
    SET 
        is_verified = COALESCE(p_is_verified, is_verified),
        code_letter = COALESCE(p_code_letter, code_letter),
        status = COALESCE(p_status, status),
        updated_at = now()
    WHERE id = p_reg_id;
END;
$$;


ALTER FUNCTION "public"."stage_portal_update_registration"("p_token" "text", "p_reg_id" "uuid", "p_is_verified" boolean, "p_code_letter" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_update_code_letter"("p_schedule_id" "uuid", "p_registration_id" "uuid", "p_code_letter" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $_$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF p_code_letter IS NULL OR upper(trim(p_code_letter)) !~ '^[A-Z]$' THEN
    RAISE EXCEPTION 'Code letter must be a single letter from A to Z.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN
    RAISE EXCEPTION 'Code letters are locked for this event.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_registration FROM public.registrations r
  WHERE r.id = p_registration_id
    AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id
    AND (
      r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible)
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The registration is outside the current schedule scope.' USING ERRCODE = '42501';
  END IF;
  IF v_registration.status = 'rejected' OR v_registration.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified and active registrations can receive a code letter.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.id <> v_registration.id
      AND r.festival_id = v_schedule.festival_id
      AND r.item_id = v_schedule.item_id
      AND r.status <> 'rejected'
      AND r.is_verified IS TRUE
      AND upper(trim(r.code_letter)) = upper(trim(p_code_letter))
      AND (
        r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
        OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible)
      )
  ) THEN
    RAISE EXCEPTION 'This code letter is already assigned in the event.' USING ERRCODE = '23505';
  END IF;

  v_old := to_jsonb(v_registration);
  UPDATE public.registrations SET code_letter = upper(trim(p_code_letter)) WHERE id = v_registration.id;
  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = v_registration.id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (
    v_tenant_id, auth.uid(), 'stage_management_code_letter_update', 'registrations', v_registration.id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id)
  );

  RETURN jsonb_build_object('registration_id', v_registration.id, 'code_letter', upper(trim(p_code_letter)));
END;
$_$;


ALTER FUNCTION "public"."stage_update_code_letter"("p_schedule_id" "uuid", "p_registration_id" "uuid", "p_code_letter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_update_registration"("p_schedule_id" "uuid", "p_registration_id" "uuid", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN
    RAISE EXCEPTION 'This event is locked. Unlock it before changing check-in status.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_registration FROM public.registrations r
  WHERE r.id = p_registration_id
    AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id
    AND (
      r.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR r.tenant_id IN (
        SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The registration is outside the current schedule scope.' USING ERRCODE = '42501';
  END IF;

  v_old := to_jsonb(v_registration);
  IF p_action = 'verify' THEN
    UPDATE public.registrations SET is_verified = true WHERE id = v_registration.id;
  ELSIF p_action = 'unverify' THEN
    UPDATE public.registrations SET is_verified = false WHERE id = v_registration.id;
  ELSIF p_action = 'reject' THEN
    UPDATE public.registrations SET status = 'rejected', is_verified = false, code_letter = NULL WHERE id = v_registration.id;
  ELSIF p_action = 'restore' THEN
    UPDATE public.registrations SET status = 'approved', is_verified = false WHERE id = v_registration.id;
  ELSE
    RAISE EXCEPTION 'Unsupported Stage Management registration action.' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = v_registration.id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_tenant_id, auth.uid(), 'stage_management_' || p_action, 'registrations', v_registration.id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id));

  RETURN jsonb_build_object('registration_id', v_registration.id, 'action', p_action);
END;
$$;


ALTER FUNCTION "public"."stage_update_registration"("p_schedule_id" "uuid", "p_registration_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_update_schedule_lock"("p_schedule_id" "uuid", "p_locked" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.'
      USING ERRCODE = '42501';
  END IF;

  v_old := to_jsonb(v_schedule);
  UPDATE public.schedules
     SET is_shuffle_locked = p_locked,
         shuffle_locked_at = CASE WHEN p_locked THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = p_schedule_id AND tenant_id = v_tenant_id;
  SELECT to_jsonb(s) INTO v_new FROM public.schedules s WHERE s.id = p_schedule_id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (
    v_tenant_id, auth.uid(), CASE WHEN p_locked THEN 'stage_management_schedule_lock' ELSE 'stage_management_schedule_unlock' END,
    'schedules', p_schedule_id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id)
  );

  RETURN jsonb_build_object('schedule_id', p_schedule_id, 'locked', p_locked);
END;
$$;


ALTER FUNCTION "public"."stage_update_schedule_lock"("p_schedule_id" "uuid", "p_locked" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stage_verify_token"("p_token" "text", OUT "out_tenant_id" "uuid", OUT "out_venue_id" "uuid") RETURNS "record"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    SELECT tenant_id, venue_id
    INTO out_tenant_id, out_venue_id
    FROM stage_tokens
    WHERE token = p_token
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired stage token';
    END IF;
END;
$$;


ALTER FUNCTION "public"."stage_verify_token"("p_token" "text", OUT "out_tenant_id" "uuid", OUT "out_venue_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_schedule_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_is_final" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_judge_id uuid;
  v_schedule_item_id uuid;
BEGIN
  SELECT jt.tenant_id, jt.judge_id INTO v_tenant_id, v_judge_id
  FROM public.judge_tokens jt
  WHERE jt.token = upper(trim(p_token))
    AND jt.schedule_id = p_schedule_id
    AND COALESCE(jt.is_used, false) = false;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired judge token';
  END IF;

  SELECT item_id INTO v_schedule_item_id
  FROM public.schedules
  WHERE id = p_schedule_id
    AND tenant_id = v_tenant_id;

  IF v_schedule_item_id IS NULL THEN
    RAISE EXCEPTION 'Schedule not found in this tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.registrations r
    WHERE r.id = p_registration_id
      AND r.tenant_id = v_tenant_id
      AND r.item_id = v_schedule_item_id
      AND r.status IS DISTINCT FROM 'rejected'
  ) THEN
    RAISE EXCEPTION 'Registration not found in this schedule/tenant';
  END IF;

  INSERT INTO public.mark_entries (
    tenant_id,
    schedule_id,
    judge_id,
    registration_id,
    criteria_scores,
    total_mark,
    is_draft,
    is_final,
    submitted_at
  ) VALUES (
    v_tenant_id,
    p_schedule_id,
    v_judge_id,
    p_registration_id,
    p_criteria_scores,
    p_total_mark,
    NOT p_is_final,
    p_is_final,
    CASE WHEN p_is_final THEN now() ELSE NULL END
  )
  ON CONFLICT (schedule_id, judge_id, registration_id)
  DO UPDATE SET
    criteria_scores = EXCLUDED.criteria_scores,
    total_mark = EXCLUDED.total_mark,
    is_draft = EXCLUDED.is_draft,
    is_final = EXCLUDED.is_final,
    submitted_at = EXCLUDED.submitted_at;

  RETURN jsonb_build_object(
    'success', true,
    'judge_id', v_judge_id,
    'tenant_id', v_tenant_id
  );
END;
$$;


ALTER FUNCTION "public"."submit_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_schedule_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_is_final" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_festival_year_from_start_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.start_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.festival_year IS NULL THEN
    NEW.festival_year := EXTRACT(YEAR FROM NEW.start_date)::int;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.start_date IS DISTINCT FROM OLD.start_date
    AND NEW.festival_year IS NOT DISTINCT FROM OLD.festival_year
  THEN
    NEW.festival_year := EXTRACT(YEAR FROM NEW.start_date)::int;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_festival_year_from_start_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_page_registry"("p_manifest" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_page       jsonb;
  v_upsert_cnt int := 0;
BEGIN
  IF NOT (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  FOR v_page IN SELECT * FROM jsonb_array_elements(p_manifest) LOOP
    INSERT INTO system_pages (page_key, page_name, route_path, category, is_critical, dependencies)
    VALUES (
      v_page->>'page_key',
      v_page->>'page_name',
      v_page->>'route_path',
      COALESCE(v_page->>'category', 'ADMIN'),
      COALESCE((v_page->>'is_critical')::boolean, false),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(v_page->'dependencies')),
        '{}'::text[]
      )
    )
    ON CONFLICT (page_key) DO UPDATE
      SET page_name    = EXCLUDED.page_name,
          route_path   = EXCLUDED.route_path,
          category     = EXCLUDED.category,
          is_critical  = EXCLUDED.is_critical,
          dependencies = EXCLUDED.dependencies,
          -- NOTE: status is NOT overwritten on sync — preserves admin's settings
          updated_at   = now();

    v_upsert_cnt := v_upsert_cnt + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'synced_count', v_upsert_cnt);
END;
$$;


ALTER FUNCTION "public"."sync_page_registry"("p_manifest" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_to_jwt"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || 
    json_build_object(
      'tenant_id', NEW.tenant_id,
      'is_superadmin', COALESCE(NEW.is_superadmin, false)
    )::jsonb
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_profile_to_jwt"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."terminate_participant"("p_participant_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Verify the caller is an admin
  IF NOT (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('tenant_admin', 'festival_admin', 'admin')
  )) THEN
    RAISE EXCEPTION 'Only administrators can terminate participants.';
  END IF;

  UPDATE public.participants
  SET is_terminated = true,
      termination_reason = p_reason,
      updated_at = now()
  WHERE id = p_participant_id;
END;
$$;


ALTER FUNCTION "public"."terminate_participant"("p_participant_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_announcer_result_visibility"("p_token" "text", "p_item_id" "uuid", "p_is_public" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      DECLARE
        v_token_record RECORD;
      BEGIN
        -- Verify token
        SELECT * INTO v_token_record 
        FROM public.announcer_tokens 
        WHERE token = p_token AND is_active = true;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Invalid or inactive announcer token.';
        END IF;

        -- Check if it has expired
        IF v_token_record.expires_at IS NOT NULL AND v_token_record.expires_at < now() THEN
          RAISE EXCEPTION 'Announcer token has expired.';
        END IF;

        -- Update the result visibility for the item
        UPDATE public.results
        SET 
          public_visible = p_is_public,
          published_at = CASE WHEN p_is_public THEN now() ELSE published_at END
        WHERE item_id = p_item_id AND festival_id = v_token_record.festival_id;
      END;
      $$;


ALTER FUNCTION "public"."toggle_announcer_result_visibility"("p_token" "text", "p_item_id" "uuid", "p_is_public" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_participant_team"("p_participant_id" "uuid", "p_new_org_id" "uuid", "p_admin_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_participant RECORD;
  v_old_org_id uuid;
  v_duplicate_exists boolean;
BEGIN
  -- 1. Fetch current participant details
  SELECT * INTO v_participant FROM public.participants WHERE id = p_participant_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  v_old_org_id := v_participant.organisation_id;

  -- If the org is the same, do nothing
  IF v_old_org_id = p_new_org_id THEN
    RETURN;
  END IF;

  -- 2. Check for duplicate name in the new organisation
  SELECT EXISTS (
    SELECT 1 FROM public.participants 
    WHERE organisation_id = p_new_org_id 
      AND lower(trim(name)) = lower(trim(v_participant.name))
  ) INTO v_duplicate_exists;

  IF v_duplicate_exists THEN
    RAISE EXCEPTION 'A participant with this exact name already exists in the selected unit.';
  END IF;

  -- 3. Update Participant's Unit
  UPDATE public.participants 
  SET organisation_id = p_new_org_id,
      updated_at = now()
  WHERE id = p_participant_id;

  -- 4. Update Solo Registrations to the new Unit
  -- This ensures points for these items go to the new unit.
  UPDATE public.registrations
  SET organisation_id = p_new_org_id
  WHERE participant_id = p_participant_id
    AND (is_group_registration = false OR is_group_registration IS NULL);

  -- 5. Audit Log (Record the transfer)
  INSERT INTO public.participant_unit_audit_logs (
    participant_id,
    old_unit_id,
    new_unit_id,
    changed_by,
    reason,
    changed_at
  ) VALUES (
    p_participant_id,
    v_old_org_id,
    p_new_org_id,
    p_admin_id,
    'Surgical Team Transfer via Admin Panel',
    now()
  );

END;
$$;


ALTER FUNCTION "public"."transfer_participant_team"("p_participant_id" "uuid", "p_new_org_id" "uuid", "p_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unlock_schedule_marks"("p_schedule_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      BEGIN
        -- 1. Unlock ONLY mark entries for active judges
        UPDATE public.mark_entries m
        SET is_final = false
        WHERE m.schedule_id = p_schedule_id
          AND EXISTS (
            SELECT 1 FROM public.schedule_judge_assignments a
            WHERE a.schedule_id = m.schedule_id
              AND a.judge_id = m.judge_id
              AND a.tenant_id = m.tenant_id
              AND a.status = 'active'
          );

        -- 2. Revert results status to draft if it's already published or ready
        UPDATE public.results
        SET result_status = 'draft',
            published = false
        WHERE schedule_id = p_schedule_id
          AND result_status IN ('published', 'ready');
      END;
      $$;


ALTER FUNCTION "public"."unlock_schedule_marks"("p_schedule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_modified_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_modified_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_page_status"("p_page_key" "text", "p_new_status" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_page        record;
  v_caller_email text;
  v_old_status  text;
  v_action      text;
BEGIN
  -- 1. Permission check
  IF NOT (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  -- 2. Validate status value
  IF p_new_status NOT IN ('ACTIVE', 'HIDDEN', 'LOCKED', 'MAINTENANCE') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status value');
  END IF;

  -- 3. Fetch page
  SELECT * INTO v_page FROM system_pages WHERE page_key = p_page_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Page not found: ' || p_page_key);
  END IF;

  -- 4. Critical page protection — cannot LOCK or set MAINTENANCE
  IF v_page.is_critical AND p_new_status IN ('LOCKED', 'MAINTENANCE') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Critical system pages cannot be locked or set to maintenance mode'
    );
  END IF;

  v_old_status := v_page.status;

  -- 5. Determine audit action label
  v_action := CASE p_new_status
    WHEN 'HIDDEN'      THEN 'PAGE_HIDDEN'
    WHEN 'ACTIVE'      THEN 'PAGE_ACTIVE'
    WHEN 'LOCKED'      THEN 'PAGE_LOCKED'
    WHEN 'MAINTENANCE' THEN 'PAGE_MAINTENANCE'
    ELSE 'PAGE_STATUS_CHANGED'
  END;

  -- 6. Get caller email for audit trail
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();

  -- 7. Update status
  UPDATE system_pages
  SET status     = p_new_status,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE page_key = p_page_key;

  -- 8. Write audit log
  INSERT INTO page_audit_logs (page_key, page_name, action, old_status, new_status, performed_by, performed_by_email, notes)
  VALUES (v_page.page_key, v_page.page_name, v_action, v_old_status, p_new_status, auth.uid(), v_caller_email, p_notes);

  RETURN jsonb_build_object(
    'success', true,
    'page_key', p_page_key,
    'old_status', v_old_status,
    'new_status', p_new_status
  );
END;
$$;


ALTER FUNCTION "public"."update_page_status"("p_page_key" "text", "p_new_status" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   NEW.updated_at = now(); 
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_criteria_scores" "jsonb" DEFAULT '{}'::"jsonb", "p_total_mark" numeric DEFAULT NULL::numeric, "p_status" "text" DEFAULT 'draft'::"text", "p_entry_mode" "text" DEFAULT 'criteria'::"text", "p_max_mark" numeric DEFAULT 100, "p_criteria_snapshot" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_schedule_tenant_id uuid;
  v_schedule_festival_id uuid;
  v_schedule_item_id uuid;
  v_root_org_id uuid;
  v_existing_final_id uuid;
  v_result jsonb;
BEGIN
  -- 1. Token must exist, be exactly approved, unused, unrevoked, unexpired.
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'Access code is required.';
  END IF;

  SELECT jt.*
  INTO v_token
  FROM public.judge_tokens jt
  WHERE (
        jt.token_hash = encode(extensions.digest(upper(trim(p_token)), 'sha256'), 'hex')
     OR jt.token = upper(trim(p_token))
    )
    AND jt.status = 'approved'
    AND jt.is_used = false
    AND jt.is_revoked IS NOT TRUE
    AND (jt.expires_at IS NULL OR jt.expires_at > now())
  ORDER BY jt.created_at DESC
  LIMIT 1;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Access code is invalid, awaiting approval, or expired.';
  END IF;

  -- 2. The judge must remain actively assigned to the token-derived schedule.
  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = v_token.schedule_id
      AND a.judge_id = v_token.judge_id
      AND a.tenant_id = v_token.tenant_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This judge is no longer assigned to the event.';
  END IF;

  -- 3. Registration must exist.
  SELECT r.*
  INTO v_registration
  FROM public.registrations r
  WHERE r.id = p_registration_id;

  IF v_registration.id IS NULL THEN
    RAISE EXCEPTION 'Registration was not found.';
  END IF;

  -- 4. Registration must belong to the token-derived schedule context
  --    (same item and festival). The schedule id is derived from the token,
  --    never accepted from the client.
  SELECT s.tenant_id, COALESCE(s.festival_id, i.festival_id), s.item_id
  INTO v_schedule_tenant_id, v_schedule_festival_id, v_schedule_item_id
  FROM public.schedules s
  LEFT JOIN public.items i ON i.id = s.item_id
  WHERE s.id = v_token.schedule_id;

  IF v_schedule_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Event schedule was not found.';
  END IF;

  IF v_registration.item_id IS DISTINCT FROM v_schedule_item_id
     OR v_registration.festival_id IS DISTINCT FROM v_schedule_festival_id THEN
    RAISE EXCEPTION 'This registration does not belong to the scheduled event.';
  END IF;

  IF v_registration.status = 'rejected' THEN
    RAISE EXCEPTION 'This registration is no longer eligible.';
  END IF;

  -- 5. Registration must belong to the schedule owner's permitted organisation
  --    tree (parent competition may judge descendant organisations, but not
  --    siblings or unrelated trees).
  SELECT t.organisation_id
  INTO v_root_org_id
  FROM public.tenants t
  WHERE t.id = v_schedule_tenant_id;

  IF NOT EXISTS (
    WITH RECURSIVE organisation_tree AS (
      SELECT o.id
      FROM public.organisations o
      WHERE o.id = v_root_org_id
         OR (v_root_org_id IS NULL AND o.tenant_id = v_schedule_tenant_id)

      UNION

      SELECT child.id
      FROM public.organisations child
      INNER JOIN organisation_tree parent ON child.parent_id = parent.id
    )
    SELECT 1
    FROM public.registrations r
    LEFT JOIN public.participants p ON p.id = r.participant_id
    WHERE r.id = v_registration.id
      AND COALESCE(r.organisation_id, p.organisation_id)
          IN (SELECT id FROM organisation_tree)
  ) THEN
    RAISE EXCEPTION 'This registration is outside the permitted organisation scope.';
  END IF;

  -- 6. Status validation.
  IF p_status NOT IN ('draft', 'final') THEN
    RAISE EXCEPTION 'Mark status must be draft or final.';
  END IF;

  -- 7. Final marks remain immutable. If a final entry already exists for this
  --    judge/schedule/registration, reject the write before it reaches the
  --    scoring trigger.
  IF p_status = 'final' THEN
    SELECT me.id
    INTO v_existing_final_id
    FROM public.mark_entries me
    WHERE me.schedule_id = v_token.schedule_id
      AND me.judge_id = v_token.judge_id
      AND me.registration_id = v_registration.id
      AND me.is_final = true
    LIMIT 1;

    IF v_existing_final_id IS NOT NULL THEN
      RAISE EXCEPTION 'Final marks have already been submitted for this participant.';
    END IF;
  END IF;

  -- 8. Write the mark. Scoring shape/range validation and final immutability
  --    are enforced by the existing validate_mark_entry_scoring trigger, which
  --    runs before this insert/update. The authorising token row id is stored
  --    for audit; the plaintext token is never persisted here.
  WITH saved_mark AS (
    INSERT INTO public.mark_entries (
      tenant_id,
      schedule_id,
      judge_id,
      registration_id,
      criteria_scores,
      total_mark,
      entry_mode_snapshot,
      max_mark_snapshot,
      criteria_snapshot,
      is_draft,
      is_final,
      submitted_at,
      token_id,
      updated_at
    ) VALUES (
      v_token.tenant_id,
      v_token.schedule_id,
      v_token.judge_id,
      v_registration.id,
      COALESCE(p_criteria_scores, '{}'::jsonb),
      p_total_mark,
      CASE WHEN p_entry_mode = 'total_only' THEN 'total_only' ELSE 'criteria' END,
      COALESCE(p_max_mark, 100),
      COALESCE(p_criteria_snapshot, '[]'::jsonb),
      (p_status = 'draft'),
      (p_status = 'final'),
      CASE WHEN p_status = 'final' THEN now() ELSE NULL END,
      v_token.id,
      now()
    )
    ON CONFLICT (schedule_id, judge_id, registration_id)
    DO UPDATE SET
      criteria_scores = EXCLUDED.criteria_scores,
      total_mark = EXCLUDED.total_mark,
      entry_mode_snapshot = EXCLUDED.entry_mode_snapshot,
      max_mark_snapshot = EXCLUDED.max_mark_snapshot,
      criteria_snapshot = EXCLUDED.criteria_snapshot,
      is_draft = EXCLUDED.is_draft,
      is_final = EXCLUDED.is_final,
      submitted_at = COALESCE(public.mark_entries.submitted_at, EXCLUDED.submitted_at),
      token_id = EXCLUDED.token_id,
      updated_at = EXCLUDED.updated_at
    RETURNING *
  )
  SELECT jsonb_build_object(
    'id', m.id,
    'schedule_id', m.schedule_id,
    'judge_id', m.judge_id,
    'registration_id', m.registration_id,
    'is_draft', m.is_draft,
    'is_final', m.is_final,
    'total_mark', m.total_mark,
    'updated_at', m.updated_at
  ) INTO v_result
  FROM saved_mark m;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."upsert_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_status" "text", "p_entry_mode" "text", "p_max_mark" numeric, "p_criteria_snapshot" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_tenant_terminology"("p_tenant_id" "uuid", "p_org_level_1_label" "text" DEFAULT NULL::"text", "p_org_level_2_label" "text" DEFAULT NULL::"text", "p_org_level_3_label" "text" DEFAULT NULL::"text", "p_org_level_4_label" "text" DEFAULT NULL::"text", "p_org_level_5_label" "text" DEFAULT NULL::"text", "p_festival_name" "text" DEFAULT NULL::"text", "p_organization_name" "text" DEFAULT NULL::"text", "p_participant_label" "text" DEFAULT NULL::"text", "p_registration_label" "text" DEFAULT NULL::"text", "p_result_label" "text" DEFAULT NULL::"text", "p_schedule_label" "text" DEFAULT NULL::"text", "p_venue_label" "text" DEFAULT NULL::"text", "p_judge_label" "text" DEFAULT NULL::"text", "p_score_label" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Verify caller belongs to this tenant or is superadmin
    IF NOT public.verify_tenant_access(p_tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized: you cannot modify terminology for this tenant';
    END IF;

    INSERT INTO public.tenant_terminology (
        tenant_id, org_level_1_label, org_level_2_label, org_level_3_label,
        org_level_4_label, org_level_5_label, festival_name, organization_name,
        participant_label, registration_label, result_label, schedule_label,
        venue_label, judge_label, score_label
    ) VALUES (
        p_tenant_id, p_org_level_1_label, p_org_level_2_label, p_org_level_3_label,
        p_org_level_4_label, p_org_level_5_label, p_festival_name, p_organization_name,
        p_participant_label, p_registration_label, p_result_label, p_schedule_label,
        p_venue_label, p_judge_label, p_score_label
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        org_level_1_label = EXCLUDED.org_level_1_label,
        org_level_2_label = EXCLUDED.org_level_2_label,
        org_level_3_label = EXCLUDED.org_level_3_label,
        org_level_4_label = EXCLUDED.org_level_4_label,
        org_level_5_label = EXCLUDED.org_level_5_label,
        festival_name = EXCLUDED.festival_name,
        organization_name = EXCLUDED.organization_name,
        participant_label = EXCLUDED.participant_label,
        registration_label = EXCLUDED.registration_label,
        result_label = EXCLUDED.result_label,
        schedule_label = EXCLUDED.schedule_label,
        venue_label = EXCLUDED.venue_label,
        judge_label = EXCLUDED.judge_label,
        score_label = EXCLUDED.score_label,
        updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."upsert_tenant_terminology"("p_tenant_id" "uuid", "p_org_level_1_label" "text", "p_org_level_2_label" "text", "p_org_level_3_label" "text", "p_org_level_4_label" "text", "p_org_level_5_label" "text", "p_festival_name" "text", "p_organization_name" "text", "p_participant_label" "text", "p_registration_label" "text", "p_result_label" "text", "p_schedule_label" "text", "p_venue_label" "text", "p_judge_label" "text", "p_score_label" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_festival_category_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_festival_tenant uuid;
  v_template text;
BEGIN
  SELECT tenant_id, festival_template
  INTO v_festival_tenant, v_template
  FROM public.festival_calendar
  WHERE id = NEW.festival_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Festival not found.';
  END IF;
  IF v_template <> 'college_fest' THEN
    RAISE EXCEPTION 'Custom categories are available only for College Fest festivals.';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM v_festival_tenant THEN
    RAISE EXCEPTION 'Category tenant does not match the selected festival.';
  END IF;

  NEW.name := btrim(NEW.name);
  NEW.code := lower(btrim(NEW.code));
  NEW.updated_at := now();
  IF NEW.is_active THEN
    NEW.archived_at := NULL;
  ELSIF NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.festival_id IS DISTINCT FROM OLD.festival_id THEN
      RAISE EXCEPTION 'A category cannot be moved to another tenant or festival.';
    END IF;
    IF NEW.code IS DISTINCT FROM OLD.code AND (
      EXISTS (SELECT 1 FROM public.participants p
              WHERE p.festival_id = OLD.festival_id AND p.category_code = OLD.code)
      OR EXISTS (SELECT 1 FROM public.items i
                 WHERE i.festival_id = OLD.festival_id AND OLD.code = ANY(i.category_codes))
    ) THEN
      RAISE EXCEPTION 'Category code cannot be changed after it has been used.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_festival_category_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_festival_team_mapping"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_festival_tenant uuid;
  v_root_org uuid;
  v_valid_org boolean;
BEGIN
  SELECT f.tenant_id, t.organisation_id
    INTO v_festival_tenant, v_root_org
  FROM public.festival_calendar f
  LEFT JOIN public.tenants t ON t.id = NEW.parent_tenant_id
  WHERE f.id = NEW.festival_id;

  IF v_festival_tenant IS NULL OR v_festival_tenant IS DISTINCT FROM NEW.parent_tenant_id THEN
    RAISE EXCEPTION 'Festival team must use the festival parent tenant.';
  END IF;

  IF v_root_org IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.organisations o
      WHERE o.id = NEW.organisation_id
        AND o.tenant_id = NEW.parent_tenant_id
        AND o.archived_at IS NULL
    ) INTO v_valid_org;
  ELSE
    WITH RECURSIVE org_tree AS (
      SELECT o.id
      FROM public.organisations o
      WHERE o.id = v_root_org AND o.archived_at IS NULL
      UNION ALL
      SELECT child.id
      FROM public.organisations child
      JOIN org_tree parent ON parent.id = child.parent_id
      WHERE child.archived_at IS NULL
    )
    SELECT EXISTS (
      SELECT 1 FROM org_tree WHERE id = NEW.organisation_id
    ) INTO v_valid_org;
  END IF;

  IF NOT COALESCE(v_valid_org, false) THEN
    RAISE EXCEPTION 'Organisation is not an active organisation in the parent tenant hierarchy.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_festival_team_mapping"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_item_categories_for_template"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_template text;
  v_elem text;
  v_dup_count int := 0;
BEGIN
  IF NEW.festival_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_template := public.resolve_festival_template(NEW.festival_id);
  IF v_template <> 'college_fest' THEN
    RETURN NEW;
  END IF;

  IF NEW.category_codes IS NULL OR cardinality(NEW.category_codes) = 0 THEN
    RAISE EXCEPTION 'College Fest items require at least one active category.';
  END IF;
  IF array_ndims(NEW.category_codes) <> 1 THEN
    RAISE EXCEPTION 'College Fest item category_codes must be a one-dimensional array.';
  END IF;

  FOREACH v_elem IN ARRAY NEW.category_codes LOOP
    IF v_elem IS NULL OR btrim(v_elem) = '' THEN
      RAISE EXCEPTION 'College Fest item category_codes contains a null or blank value.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.festival_categories c
      WHERE c.festival_id = NEW.festival_id
        AND c.tenant_id = NEW.tenant_id
        AND c.is_active
        AND lower(btrim(c.code)) = lower(btrim(v_elem))
    ) THEN
      -- Preserve an already-used archived category on an existing item. It
      -- cannot be introduced to a new item or added during an edit.
      IF TG_OP <> 'UPDATE' OR NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(OLD.category_codes, ARRAY[]::text[])) AS old_code
        WHERE lower(btrim(old_code)) = lower(btrim(v_elem))
      ) THEN
        RAISE EXCEPTION 'College Fest item category % is invalid, archived, or belongs to another festival.', v_elem;
      END IF;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_dup_count
  FROM (
    SELECT upper(btrim(x))
    FROM unnest(NEW.category_codes) AS x
    GROUP BY upper(btrim(x))
    HAVING count(*) > 1
  ) dup;
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'College Fest item category_codes contains duplicate categories.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_item_categories_for_template"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_item_categories_for_template"() IS 'College Fest item categories must be active when introduced. Existing archived category references remain valid on updates so historical item data is not broken.';



CREATE OR REPLACE FUNCTION "public"."validate_judge_token"("p_token" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_token_hash text;
  v_result json;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN NULL;
  END IF;

  v_token_hash := encode(
    extensions.digest(upper(trim(p_token)), 'sha256'),
    'hex'
  );

  SELECT json_build_object(
    'id', jt.id,
    'token', jt.token,
    'status', jt.status,
    'is_used', jt.is_used,
    'judge_id', jt.judge_id,
    'schedule_id', jt.schedule_id,
    'tenant_id', jt.tenant_id,
    'judges', json_build_object('name', j.name),
    'schedules', json_build_object(
      'id', s.id,
      'start_time', s.start_time,
      'items', json_build_object(
        'item_name_ml', i.item_name_ml,
        'item_name_en', i.item_name_en
      ),
      'venues', json_build_object('name', v.name)
    )
  )
  INTO v_result
  FROM public.judge_tokens jt
  JOIN public.schedule_judge_assignments a
    ON a.schedule_id = jt.schedule_id
   AND a.judge_id = jt.judge_id
   AND a.tenant_id = jt.tenant_id
   AND a.status = 'active'
  LEFT JOIN public.judges j ON j.id = jt.judge_id
  LEFT JOIN public.schedules s ON s.id = jt.schedule_id
  LEFT JOIN public.items i ON i.id = s.item_id
  LEFT JOIN public.venues v ON v.id = s.venue_id
  WHERE (jt.token_hash = v_token_hash OR jt.token = upper(trim(p_token)))
    AND jt.is_used = false
    AND jt.is_revoked IS NOT TRUE
    AND jt.status IS DISTINCT FROM 'rejected'
    AND (jt.expires_at IS NULL OR jt.expires_at > now())
  ORDER BY jt.created_at DESC
  LIMIT 1;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."validate_judge_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_mark_entry_scoring"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  score_total numeric := 0;
  score_entry record;
  criterion jsonb;
  criterion_key text;
  criterion_max numeric;
  criterion_score numeric;
  score_count integer := 0;
  criterion_count integer := 0;
  criterion_max_total numeric := 0;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.is_final IS TRUE
     AND NEW.is_final IS TRUE
     AND (
       NEW.criteria_scores IS DISTINCT FROM OLD.criteria_scores
       OR NEW.total_mark IS DISTINCT FROM OLD.total_mark
       OR NEW.entry_mode_snapshot IS DISTINCT FROM OLD.entry_mode_snapshot
       OR NEW.max_mark_snapshot IS DISTINCT FROM OLD.max_mark_snapshot
       OR NEW.criteria_snapshot IS DISTINCT FROM OLD.criteria_snapshot
       OR NEW.is_draft IS DISTINCT FROM OLD.is_draft
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     )
  THEN
    RAISE EXCEPTION 'Final marks cannot be modified or reopened.';
  END IF;

  IF NEW.is_final IS TRUE AND NEW.total_mark IS NULL THEN
    RAISE EXCEPTION 'A final mark requires a total.';
  END IF;

  IF NEW.entry_mode_snapshot = 'total_only' THEN
    IF NEW.max_mark_snapshot <> 100 THEN
      RAISE EXCEPTION 'Paper total mode must use a maximum mark of 100.';
    END IF;

    NEW.criteria_scores := COALESCE(NEW.criteria_scores, '{}'::jsonb);
    IF jsonb_typeof(NEW.criteria_scores) <> 'object'
       OR NEW.criteria_scores <> '{}'::jsonb
    THEN
      RAISE EXCEPTION 'Paper total mode cannot contain criterion scores.';
    END IF;

    RETURN NEW;
  END IF;

  NEW.criteria_scores := COALESCE(NEW.criteria_scores, '{}'::jsonb);
  IF jsonb_typeof(NEW.criteria_scores) <> 'object' THEN
    RAISE EXCEPTION 'Criteria scores must be a JSON object.';
  END IF;

  FOR score_entry IN SELECT key, value FROM jsonb_each(NEW.criteria_scores)
  LOOP
    score_count := score_count + 1;
    IF jsonb_typeof(score_entry.value) <> 'number' THEN
      RAISE EXCEPTION 'Every criterion score must be numeric.';
    END IF;
    criterion_score := (score_entry.value #>> '{}')::numeric;
    IF criterion_score < 0 THEN
      RAISE EXCEPTION 'Criterion scores cannot be negative.';
    END IF;
    score_total := score_total + criterion_score;
  END LOOP;

  IF NEW.total_mark IS DISTINCT FROM score_total THEN
    RAISE EXCEPTION 'Total mark must equal the sum of criterion scores.';
  END IF;

  -- Legacy entries intentionally have an empty snapshot. New clients provide
  -- a snapshot, which enables complete server-side validation.
  IF jsonb_array_length(NEW.criteria_snapshot) > 0 THEN
    FOR criterion IN SELECT value FROM jsonb_array_elements(NEW.criteria_snapshot)
    LOOP
      criterion_count := criterion_count + 1;
      criterion_key := criterion->>'key';
      criterion_max := (criterion->>'max')::numeric;
      criterion_max_total := criterion_max_total + COALESCE(criterion_max, 0);

      IF criterion_key IS NULL OR criterion_key = '' OR criterion_max IS NULL OR criterion_max <= 0 THEN
        RAISE EXCEPTION 'Invalid scoring criterion snapshot.';
      END IF;

      IF NEW.criteria_scores ? criterion_key THEN
        criterion_score := (NEW.criteria_scores->>criterion_key)::numeric;
        IF criterion_score > criterion_max THEN
          RAISE EXCEPTION 'Criterion % exceeds its maximum mark of %.', criterion_key, criterion_max;
        END IF;
      ELSIF NEW.is_final IS TRUE THEN
        RAISE EXCEPTION 'A final mark is missing criterion %.', criterion_key;
      END IF;
    END LOOP;

    IF criterion_max_total <> NEW.max_mark_snapshot THEN
      RAISE EXCEPTION 'Criterion maxima must equal the saved maximum mark.';
    END IF;
    IF score_count > criterion_count THEN
      RAISE EXCEPTION 'Criteria scores contain an unknown criterion.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_mark_entry_scoring"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_participant_category"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_template text;
  expected_cat text;
  p_festival_year int := 2026;
  junior_limit date := make_date(p_festival_year - 20, 5, 31);
  senior_limit date := make_date(p_festival_year - 26, 5, 31);
BEGIN
  IF NEW.festival_id IS NOT NULL THEN
    v_template := public.resolve_festival_template(NEW.festival_id);
  END IF;

  IF v_template = 'college_fest' THEN
    IF NEW.category_code IS NULL OR btrim(NEW.category_code) = '' THEN
      RAISE EXCEPTION 'College Fest participants require a category.';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.festival_categories c
      WHERE c.festival_id = NEW.festival_id
        AND c.code = NEW.category_code
        AND (
          c.is_active
          OR (TG_OP = 'UPDATE'
              AND NEW.category_code IS NOT DISTINCT FROM OLD.category_code
              AND NEW.festival_id IS NOT DISTINCT FROM OLD.festival_id)
        )
    ) THEN
      RAISE EXCEPTION 'Selected College Fest category is invalid, archived, or belongs to another festival.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.dob IS NOT NULL OR NEW.education_type IS NOT NULL OR NEW.class_std IS NOT NULL THEN
    expected_cat := ssf_get_category(NEW.dob, NEW.class_std::int, NEW.education_type, p_festival_year);
    IF expected_cat IS NOT NULL AND expected_cat != NEW.category_code THEN
      RAISE EXCEPTION 'Category mismatch. Expected: %, Got: %. Check DOB, class, and education type.', expected_cat, NEW.category_code;
    END IF;
  END IF;
  IF NEW.category_code = 'JUNIOR' AND NEW.dob IS NOT NULL AND NEW.dob <= junior_limit THEN
    RAISE EXCEPTION 'JUNIOR category: DOB must be after %', junior_limit;
  END IF;
  IF NEW.category_code = 'SENIOR' AND NEW.dob IS NOT NULL AND NEW.dob <= senior_limit THEN
    RAISE EXCEPTION 'SENIOR category: DOB must be after %', senior_limit;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_participant_category"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_participant_category"() IS 'Validates College Fest categories by festival membership; participant child-tenant ownership is allowed.';



CREATE OR REPLACE FUNCTION "public"."validate_registration_category_compatibility"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_template text;
  v_participant_category text;
  v_item_categories text[];
BEGIN
  IF NEW.festival_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_template := public.resolve_festival_template(NEW.festival_id);
  IF v_template <> 'college_fest' THEN
    RETURN NEW;
  END IF;
  IF NEW.participant_id IS NULL OR NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_participant_category := public.resolve_participant_category(NEW.participant_id);
  v_item_categories := public.resolve_item_categories(NEW.item_id);

  IF v_item_categories IS NULL OR cardinality(v_item_categories) = 0 THEN
    RAISE EXCEPTION 'College Fest item % has no categories; registration is not allowed.', NEW.item_id;
  END IF;

  -- GN/GENERAL is the open category: it accepts every existing participant bucket.
  IF EXISTS (
    SELECT 1 FROM unnest(v_item_categories) AS category_code
    WHERE upper(btrim(category_code)) = 'GN' OR upper(btrim(category_code)) = 'GENERAL'
  ) THEN
    RETURN NEW;
  END IF;

  IF v_participant_category IS NULL OR NOT EXISTS (
    SELECT 1
    FROM unnest(v_item_categories) AS category_code
    WHERE upper(btrim(category_code)) = upper(btrim(v_participant_category))
  ) THEN
    RAISE EXCEPTION 'College Fest registration: participant category % does not match item % categories (%).',
      v_participant_category, NEW.item_id, array_to_string(v_item_categories, ', ');
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_registration_category_compatibility"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_registration_category_compatibility"() IS 'Trigger-only registration category validator. SECURITY DEFINER is required to call internal category resolvers; fixed search_path and direct client execution revoked.';



CREATE OR REPLACE FUNCTION "public"."validate_result_points_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rank_points numeric;
  v_grade_points numeric;
  v_rule12_applied boolean;
  v_rule12_behavior text;
BEGIN
  IF NEW.published IS NOT TRUE OR NEW.points_calculation IS NULL THEN
    RETURN NEW;
  END IF;

  v_rank_points := COALESCE((NEW.points_calculation->>'rank_points')::numeric, 0);
  v_grade_points := COALESCE((NEW.points_calculation->>'grade_points')::numeric, 0);
  v_rule12_applied := COALESCE((NEW.points_calculation->>'rule12_applied')::boolean, false);
  v_rule12_behavior := COALESCE(NEW.points_calculation->>'rule12_behavior', 'grade_only');

  IF v_rank_points < 0 OR v_grade_points < 0 THEN
    RAISE EXCEPTION 'Calculated points cannot be negative.';
  END IF;

  IF COALESCE(NEW.points_awarded, 0) <> v_rank_points + v_grade_points THEN
    RAISE EXCEPTION 'Published points do not match the calculation snapshot.';
  END IF;

  IF v_rule12_applied
    AND v_rule12_behavior = 'grade_only'
    AND v_rank_points <> 0 THEN
    RAISE EXCEPTION 'Rule 12 grade-only results cannot contain rank points.';
  END IF;

  IF NEW.points_config_version IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.points_config_versions pcv
      WHERE pcv.festival_id = NEW.festival_id
        AND pcv.config_version = NEW.points_config_version
    ) THEN
    RAISE EXCEPTION 'Points configuration version does not exist for this festival.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_result_points_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_stage_token"("p_token" "text") RETURNS TABLE("id" "uuid", "venue_id" "uuid", "festival_id" "uuid", "tenant_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT st.id, st.venue_id, st.festival_id, st.tenant_id
  FROM stage_tokens st
  WHERE st.token = upper(trim(p_token))
    AND st.is_active = true
    AND (st.expires_at IS NULL OR st.expires_at > now());
END; $$;


ALTER FUNCTION "public"."validate_stage_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_team_leader_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_role text;
  v_team_active boolean;
BEGIN
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  IF v_role IS DISTINCT FROM 'team_leader' THEN
    RAISE EXCEPTION 'Assigned user must have the team_leader role.';
  END IF;

  SELECT ft.is_active INTO v_team_active
  FROM public.festival_teams ft
  WHERE ft.id = NEW.festival_team_id;

  IF NOT COALESCE(v_team_active, false) THEN
    RAISE EXCEPTION 'Team Leader assignment requires an active festival team.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.team_leader_assignments existing
    JOIN public.festival_teams existing_team
      ON existing_team.id = existing.festival_team_id
    WHERE existing.user_id = NEW.user_id
      AND existing_team.festival_id = (
        SELECT festival_id FROM public.festival_teams WHERE id = NEW.festival_team_id
      )
      AND existing.status = 'active'
      AND existing.revoked_at IS NULL
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'A Team Leader may have only one active team assignment per festival.';
  END IF;

  IF NEW.status = 'revoked' AND NEW.revoked_at IS NULL THEN
    NEW.revoked_at := now();
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_team_leader_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_tenant_access"("p_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p_tenant_id = public.get_my_tenant_id() OR public.is_superadmin();
$$;


ALTER FUNCTION "public"."verify_tenant_access"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "title" "text",
    "message" "text",
    "type" "text",
    "target_role" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcer_tokens" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "festival_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."announcer_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "participant_id" "uuid",
    "schedule_id" "uuid",
    "checkin_time" timestamp with time zone,
    "checkin_method" "text",
    "status" "text" DEFAULT 'present'::"text"
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "action" "text",
    "table_name" "text",
    "record_id" "uuid",
    "old_value" "jsonb",
    "new_value" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "code" "text",
    "name_ml" "text",
    "class_min" integer,
    "class_max" integer,
    "age_min" integer,
    "age_max" integer,
    "gender" "text" DEFAULT 'both'::"text",
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."certificates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "participant_id" "uuid",
    "item_id" "uuid",
    "certificate_type" "text",
    "pdf_url" "text",
    "grade" "text",
    "generated_at" timestamp with time zone
);


ALTER TABLE "public"."certificates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chest_number_regeneration_audits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "festival_id" "uuid" NOT NULL,
    "category_range" integer NOT NULL,
    "participant_count" integer NOT NULL,
    "regenerated_by" "uuid",
    "regenerated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chest_number_regeneration_audits_category_range_check" CHECK (("category_range" = ANY (ARRAY[100, 1000])))
);


ALTER TABLE "public"."chest_number_regeneration_audits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."export_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "payload" "jsonb" NOT NULL,
    "status" "public"."export_status_enum" DEFAULT 'queued'::"public"."export_status_enum" NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."export_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."festival_calendar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_year" integer,
    "level" "text",
    "custom_name" "text",
    "start_date" "date",
    "end_date" "date",
    "registration_open" "date",
    "registration_close" "date",
    "result_publish_date" "date",
    "is_active" boolean DEFAULT true,
    "source" "text" DEFAULT 'handbook'::"text",
    "festival_template" "text" DEFAULT 'sahithyolsav'::"text" NOT NULL,
    "general_category_enabled" boolean DEFAULT false NOT NULL,
    "chest_number_category_range" integer DEFAULT 100 NOT NULL,
    CONSTRAINT "ck_festival_calendar_festival_template" CHECK (("festival_template" = ANY (ARRAY['sahithyolsav'::"text", 'college_fest'::"text"]))),
    CONSTRAINT "ck_festival_chest_number_category_range" CHECK (("chest_number_category_range" = ANY (ARRAY[100, 1000])))
);


ALTER TABLE "public"."festival_calendar" OWNER TO "postgres";


COMMENT ON COLUMN "public"."festival_calendar"."general_category_enabled" IS 'Whether the tenant allows General-category events for this festival. Defaults to false; existing registrations and results are never changed by toggling this setting.';



CREATE TABLE IF NOT EXISTS "public"."festival_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "festival_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "festival_categories_active_state" CHECK ((("is_active" AND ("archived_at" IS NULL)) OR ((NOT "is_active") AND ("archived_at" IS NOT NULL)))),
    CONSTRAINT "festival_categories_code_check" CHECK (("code" ~ '^[a-z][a-z0-9_]*$'::"text")),
    CONSTRAINT "festival_categories_name_check" CHECK (("btrim"("name") <> ''::"text"))
);


ALTER TABLE "public"."festival_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."festival_categories" IS 'Festival-scoped manual categories for College Fest. Codes remain stable; referenced categories are archived.';



CREATE TABLE IF NOT EXISTS "public"."festival_leaderboard_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "is_public_visible" boolean DEFAULT false,
    "auto_refresh_enabled" boolean DEFAULT false,
    "auto_refresh_interval" integer DEFAULT 30,
    "show_rank_movement" boolean DEFAULT true,
    "show_timestamps" boolean DEFAULT true,
    "show_grade_summary" boolean DEFAULT true,
    "is_frozen" boolean DEFAULT false,
    "preview_visibility" "text" DEFAULT 'draft'::"text",
    "poster_enabled" boolean DEFAULT true,
    "certificate_enabled" boolean DEFAULT false,
    "poster_top_count" integer DEFAULT 3,
    "theme_config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "show_individual_rankings" boolean DEFAULT true,
    "team_point_status" "text",
    "ranking_mode" "text" DEFAULT 'ALL'::"text",
    "item_limit" integer,
    "public_festival_name" "text"
);


ALTER TABLE "public"."festival_leaderboard_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."festival_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_tenant_id" "uuid" NOT NULL,
    "festival_id" "uuid" NOT NULL,
    "organisation_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "portal_primary_color" "text" DEFAULT '#0F766E'::"text" NOT NULL,
    "portal_accent_color" "text" DEFAULT '#14B8A6'::"text" NOT NULL,
    CONSTRAINT "festival_teams_portal_accent_color_hex" CHECK (("portal_accent_color" ~* '^#[0-9A-F]{6}$'::"text")),
    CONSTRAINT "festival_teams_portal_primary_color_hex" CHECK (("portal_primary_color" ~* '^#[0-9A-F]{6}$'::"text"))
);


ALTER TABLE "public"."festival_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."file_metadata" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "asset_type" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "bucket_name" "text" NOT NULL,
    "object_key" "text" NOT NULL,
    "content_type" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "visibility" "text" DEFAULT 'private'::"text",
    "is_public" boolean DEFAULT false,
    "expires_at" timestamp with time zone,
    "uploaded_at" timestamp with time zone DEFAULT "now"(),
    "generated_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."file_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "event_id" "uuid",
    "result_id" "uuid",
    "asset_type" "public"."asset_type_enum" DEFAULT 'poster'::"public"."asset_type_enum" NOT NULL,
    "template_id" "text",
    "render_hash" "text",
    "resolution" "public"."export_resolution_enum" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_name" "text"
);


ALTER TABLE "public"."generated_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_posters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "template_id" "uuid",
    "template_version" integer NOT NULL,
    "file_url" "text" NOT NULL,
    "object_key" "text" NOT NULL,
    "leaderboard_snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."generated_posters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grace_marks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "org_id" "uuid",
    "points" integer DEFAULT 0,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."grace_marks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registration_id" "uuid",
    "participant_id" "uuid",
    "is_locked" boolean DEFAULT false
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "festival_id" "uuid" NOT NULL,
    "filename" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "participants_count" integer DEFAULT 0,
    "registrations_count" integer DEFAULT 0,
    "skipped_count" integer DEFAULT 0,
    "error_count" integer DEFAULT 0,
    "warning_count" integer DEFAULT 0,
    "report_json" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid"
);


ALTER TABLE "public"."import_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "item_code" "text",
    "item_name_ml" "text",
    "item_name_en" "text",
    "item_type" "text",
    "participation_type" "text",
    "category_codes" "text"[],
    "gender" "text" DEFAULT 'both'::"text",
    "duration_minutes" integer,
    "group_min_members" integer,
    "group_max_members" integer,
    "level_availability" "text"[],
    "daf_allowed" boolean DEFAULT false,
    "white_dress_required" boolean DEFAULT false,
    "organizer_provides_material" boolean DEFAULT false,
    "paper_size" "text",
    "drawing_topic" "text",
    "speech_topics" "jsonb",
    "book_by_level" "jsonb",
    "originality_required" boolean DEFAULT false,
    "regional_dialect_blocked" boolean DEFAULT false,
    "calligraphy_style" "text",
    "ishal_required" boolean DEFAULT false,
    "members_locked_after" "text",
    "source" "text" DEFAULT 'handbook'::"text",
    "is_active" boolean DEFAULT true,
    "custom_rules" "text"
);


ALTER TABLE "public"."items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."judge_activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "judge_id" "uuid",
    "schedule_id" "uuid",
    "action_type" "text" NOT NULL,
    "action_details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "token_id" "uuid",
    "actor_user_id" "uuid",
    "actor_type" "text" DEFAULT 'system'::"text" NOT NULL
);


ALTER TABLE "public"."judge_activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."judge_session_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "judge_id" "uuid",
    "schedule_id" "uuid",
    "status" "text" DEFAULT 'NOT_OPENED'::"text" NOT NULL,
    "login_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "last_activity_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."judge_session_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."judges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "name" "text",
    "phone" "text",
    "specialization" "text"[],
    "login_user_id" "uuid",
    "handbook_received" boolean DEFAULT false,
    "is_approved" boolean DEFAULT false,
    "login_pin" character varying(4)
);


ALTER TABLE "public"."judges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mark_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "schedule_id" "uuid",
    "judge_id" "uuid",
    "registration_id" "uuid",
    "criteria_scores" "jsonb",
    "total_mark" numeric,
    "is_draft" boolean DEFAULT true,
    "is_final" boolean DEFAULT false,
    "submitted_at" timestamp with time zone,
    "competition_end_time" timestamp with time zone,
    "entry_mode_snapshot" "text" DEFAULT 'criteria'::"text" NOT NULL,
    "max_mark_snapshot" numeric DEFAULT 100 NOT NULL,
    "criteria_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "token_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mark_entries_criteria_snapshot_shape_check" CHECK (("jsonb_typeof"("criteria_snapshot") = 'array'::"text")),
    CONSTRAINT "mark_entries_entry_mode_snapshot_check" CHECK (("entry_mode_snapshot" = ANY (ARRAY['criteria'::"text", 'total_only'::"text"]))),
    CONSTRAINT "mark_entries_max_mark_snapshot_check" CHECK (("max_mark_snapshot" > (0)::numeric)),
    CONSTRAINT "mark_entries_total_mark_range_check" CHECK ((("total_mark" IS NULL) OR (("total_mark" >= (0)::numeric) AND ("total_mark" <= "max_mark_snapshot"))))
);


ALTER TABLE "public"."mark_entries" OWNER TO "postgres";


COMMENT ON COLUMN "public"."mark_entries"."entry_mode_snapshot" IS 'Scoring mode captured when the judge saved this mark.';



COMMENT ON COLUMN "public"."mark_entries"."max_mark_snapshot" IS 'Maximum mark captured when the judge saved this mark.';



COMMENT ON COLUMN "public"."mark_entries"."criteria_snapshot" IS 'Criterion keys, labels, and maxima captured when the judge saved this mark.';



COMMENT ON COLUMN "public"."mark_entries"."token_id" IS 'Judge token row that authorised this mark write (internal audit reference; never a plaintext token).';



CREATE OR REPLACE VIEW "public"."judge_submission_status" AS
 SELECT "me"."schedule_id",
    "me"."registration_id",
    "me"."judge_id",
    "j"."name" AS "judge_name",
    "me"."total_mark",
    "me"."is_final",
    "me"."is_draft",
    "me"."submitted_at",
    "s"."expected_judge_count"
   FROM (("public"."mark_entries" "me"
     JOIN "public"."judges" "j" ON (("j"."id" = "me"."judge_id")))
     JOIN "public"."schedules" "s" ON (("s"."id" = "me"."schedule_id")));


ALTER VIEW "public"."judge_submission_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."judge_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "judge_id" "uuid" NOT NULL,
    "schedule_id" "uuid",
    "tenant_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_used" boolean DEFAULT false,
    "used_at" timestamp with time zone,
    "token_hash" "text",
    "expires_at" timestamp with time zone,
    "is_revoked" boolean DEFAULT false NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "revocation_reason" "text",
    "original_schedule_id" "uuid",
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "device_id" "text",
    "device_info" "text"
);


ALTER TABLE "public"."judge_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid",
    "user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "delivered_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" NOT NULL,
    "priority" "text" DEFAULT 'NORMAL'::"text" NOT NULL,
    "sender_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organisations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "name" "text" NOT NULL,
    "org_type" "text" NOT NULL,
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "admin_email" "text",
    "admin_password_temp" "text",
    "admin_internal_email" "text",
    "archived_at" timestamp with time zone
);


ALTER TABLE "public"."organisations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_key" "text" NOT NULL,
    "page_name" "text" NOT NULL,
    "action" "text" NOT NULL,
    "old_status" "text",
    "new_status" "text",
    "performed_by" "uuid",
    "performed_by_email" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."page_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_name" "text" NOT NULL,
    "snapshot_data" "jsonb" NOT NULL,
    "trigger_action" "text" DEFAULT 'MANUAL'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."page_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participant_unit_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "old_unit_id" "uuid",
    "new_unit_id" "uuid",
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "batch_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "is_reverted" boolean DEFAULT false,
    "reverted_at" timestamp with time zone,
    "reverted_by" "uuid"
);


ALTER TABLE "public"."participant_unit_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participant_unit_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total_records" integer DEFAULT 0,
    "success_count" integer DEFAULT 0,
    "failed_count" integer DEFAULT 0,
    "skipped_count" integer DEFAULT 0,
    "skip_reasons" "jsonb" DEFAULT '[]'::"jsonb",
    "processed_count" integer DEFAULT 0,
    "last_processed_participant_id" "uuid",
    "created_by" "uuid",
    "tenant_id" "uuid" NOT NULL,
    "target_unit_id" "uuid",
    "rolled_back_at" timestamp with time zone,
    "rollback_batch_id" "uuid",
    "notes" "text"
);


ALTER TABLE "public"."participant_unit_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "name" "text" NOT NULL,
    "gender" "text",
    "dob" "date",
    "category_code" "text",
    "photo_url" "text",
    "chest_number" "text",
    "unique_code" "text",
    "registered_by" "text" DEFAULT 'admin'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "plagiarism_ban_until" "date",
    "id_card_uploaded" boolean DEFAULT false,
    "residence_changed" boolean DEFAULT false,
    "sector_certificate_url" "text",
    "is_campus_parallel" boolean DEFAULT false,
    "institution_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "phone" "text",
    "org_name" "text",
    "age" integer,
    "class_std" integer,
    "email" "text",
    "membership_no" "text",
    "is_verified" boolean DEFAULT false,
    "is_locked" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "education_type" "text",
    "organisation_id" "uuid",
    "competition_level" "text",
    "profile_slug" "text",
    "profile_bio" "text",
    "public_profile_enabled" boolean DEFAULT true,
    "show_organisation_public" boolean DEFAULT true,
    "profile_photo_object_key" "text",
    "lock_scope" "text",
    "lock_reason" "text",
    "import_source" "text",
    "user_id" "uuid",
    "is_terminated" boolean DEFAULT false,
    "termination_reason" "text",
    CONSTRAINT "chk_category_code" CHECK ((("category_code" IS NULL) OR (("btrim"("category_code") = "category_code") AND ("category_code" ~ '^[A-Za-z][A-Za-z0-9_]*$'::"text")))),
    CONSTRAINT "chk_class_std" CHECK ((("class_std" IS NULL) OR (("class_std" >= 1) AND ("class_std" <= 12)))),
    CONSTRAINT "chk_education_type" CHECK ((("education_type" IS NULL) OR ("education_type" = ANY (ARRAY['degree'::"text", 'pg'::"text", 'iti'::"text", 'polytechnic'::"text", 'poly'::"text", 'ded'::"text", 'bed'::"text", 'school'::"text"]))))
);


ALTER TABLE "public"."participants" OWNER TO "postgres";


COMMENT ON CONSTRAINT "chk_category_code" ON "public"."participants" IS 'Structural category-code validation only. Festival-template validators enforce category ownership and festival membership.';



CREATE TABLE IF NOT EXISTS "public"."point_table" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "org_id" "uuid",
    "category_code" "text",
    "total_points" integer DEFAULT 0,
    "gold_count" integer DEFAULT 0,
    "silver_count" integer DEFAULT 0,
    "bronze_count" integer DEFAULT 0,
    "last_updated" timestamp with time zone,
    CONSTRAINT "point_table_category_code_check" CHECK (("category_code" = ANY (ARRAY['LP'::"text", 'UP'::"text", 'HS'::"text", 'HSS'::"text", 'JUNIOR'::"text", 'SENIOR'::"text", 'CAMPUS'::"text", 'GENERAL'::"text"])))
);


ALTER TABLE "public"."point_table" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."points_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "rank_1_points" integer DEFAULT 10,
    "rank_2_points" integer DEFAULT 7,
    "rank_3_points" integer DEFAULT 5,
    "grade_a_plus_points" integer DEFAULT 4,
    "grade_a_points" integer DEFAULT 3,
    "grade_b_points" integer DEFAULT 2,
    "grade_c_points" integer DEFAULT 1,
    "participation_points" integer DEFAULT 0,
    "less_than_3_teams_rule" boolean DEFAULT true,
    "ind_a_plus_points" integer DEFAULT 6,
    "ind_a_points" integer DEFAULT 5,
    "ind_b_points" integer DEFAULT 3,
    "ind_c_points" integer DEFAULT 1,
    "grp_a_plus_points" integer DEFAULT 18,
    "grp_a_points" integer DEFAULT 15,
    "grp_b_points" integer DEFAULT 10,
    "grp_c_points" integer DEFAULT 5,
    "points_mode" "text" DEFAULT 'hybrid'::"text" NOT NULL,
    "grade_thresholds" "jsonb" DEFAULT '{"a": 75, "b": 60, "c": 50, "a_plus": 90}'::"jsonb" NOT NULL,
    "point_brackets" "jsonb" DEFAULT '[{"key": "1", "max": 1, "min": 1, "label": "1", "points": [6, 5, 3, 1], "enabled": true}, {"key": "2", "max": 2, "min": 2, "label": "2", "points": [7, 6, 4, 2], "enabled": true}, {"key": "3", "max": 3, "min": 3, "label": "3", "points": [10, 9, 6, 3], "enabled": true}, {"key": "4-5", "max": 5, "min": 4, "label": "4–5", "points": [18, 15, 10, 5], "enabled": true}, {"key": "6-10", "max": 10, "min": 6, "label": "6–10", "points": [25, 20, 12, 6], "enabled": true}]'::"jsonb" NOT NULL,
    "group_point_brackets" "jsonb" DEFAULT '[{"key": "1", "max": 1, "min": 1, "label": "1", "points": [6, 5, 3, 1], "enabled": true}, {"key": "2", "max": 2, "min": 2, "label": "2", "points": [7, 6, 4, 2], "enabled": true}, {"key": "3", "max": 3, "min": 3, "label": "3", "points": [10, 9, 6, 3], "enabled": true}, {"key": "4-5", "max": 5, "min": 4, "label": "4–5", "points": [18, 15, 10, 5], "enabled": true}, {"key": "6-10", "max": 10, "min": 6, "label": "6–10", "points": [25, 20, 12, 6], "enabled": true}]'::"jsonb" NOT NULL,
    "separate_group_brackets" boolean DEFAULT false NOT NULL,
    "auto_bracket_selection" boolean DEFAULT true NOT NULL,
    "allow_bracket_override" boolean DEFAULT true NOT NULL,
    "rule12_min_teams" integer DEFAULT 3 NOT NULL,
    "rule12_behavior" "text" DEFAULT 'grade_only'::"text" NOT NULL,
    "config_version" integer DEFAULT 1 NOT NULL,
    "change_reason" "text",
    "enable_grace_marks" boolean DEFAULT false,
    CONSTRAINT "points_config_points_mode_check" CHECK (("points_mode" = ANY (ARRAY['official'::"text", 'hybrid'::"text", 'custom'::"text"]))),
    CONSTRAINT "points_config_rule12_behavior_check" CHECK (("rule12_behavior" = ANY (ARRAY['grade_only'::"text", 'rank_and_grade'::"text", 'no_points'::"text"]))),
    CONSTRAINT "points_config_rule12_min_teams_check" CHECK (("rule12_min_teams" >= 1))
);


ALTER TABLE "public"."points_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."points_config_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "festival_id" "uuid" NOT NULL,
    "config_version" integer NOT NULL,
    "config_snapshot" "jsonb" NOT NULL,
    "change_reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."points_config_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."poster_approval_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "requested_by" "uuid",
    "reviewed_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "reviewer_comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "poster_approval_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'changes_requested'::"text"])))
);


ALTER TABLE "public"."poster_approval_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."poster_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "editor_id" "uuid",
    "content" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."poster_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."poster_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "name" "text" NOT NULL,
    "version" integer DEFAULT 1,
    "background_url" "text" NOT NULL,
    "width" integer DEFAULT 1080,
    "height" integer DEFAULT 1080,
    "aspect_ratio" "text" DEFAULT '1:1'::"text",
    "field_mappings" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "status" "text" DEFAULT 'draft'::"text",
    "layers" "jsonb" DEFAULT '[]'::"jsonb",
    "schema_version" "text" DEFAULT '1.0'::"text",
    CONSTRAINT "poster_templates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_approval'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."poster_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."poster_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "version_number" integer NOT NULL,
    "content" "jsonb" NOT NULL,
    "editor_id" "uuid",
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."poster_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "tenant_id" "uuid",
    "role" "text",
    "full_name" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_superadmin" boolean DEFAULT false,
    "notification_enabled" boolean DEFAULT true,
    "team_leader_code" "text",
    "team_leader_email" "text",
    CONSTRAINT "profiles_role_allowed_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'judge'::"text", 'volunteer'::"text", 'participant'::"text", 'team_leader'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "item_id" "uuid",
    "participant_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "approved_by" "uuid",
    "code_letter" "text",
    "is_group_registration" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "level" "text" DEFAULT 'unit'::"text",
    "is_locked" boolean DEFAULT false,
    "organisation_id" "uuid",
    "is_verified" boolean DEFAULT false,
    "general_division" "text",
    "raw_group_members" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "item_id" "uuid",
    "registration_id" "uuid",
    "total_score" numeric,
    "rank" integer,
    "grade" "text",
    "points_awarded" integer,
    "grade_only" boolean DEFAULT false,
    "published" boolean DEFAULT false,
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "meets_state_standard" boolean,
    "audit_log" "jsonb",
    "result_status" "text" DEFAULT 'published'::"text",
    "public_visible" boolean DEFAULT false,
    "collection_method" "text",
    "public_result_no" integer,
    "points_config_version" integer,
    "points_calculation" "jsonb",
    "schedule_id" "uuid",
    CONSTRAINT "results_collection_method_check" CHECK ((("collection_method" IS NULL) OR ("collection_method" = ANY (ARRAY['judges'::"text", 'manual'::"text"])))),
    CONSTRAINT "results_result_status_check" CHECK (("result_status" = ANY (ARRAY['draft'::"text", 'ready'::"text", 'published'::"text", 'hidden'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."results" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."results_public_result_no_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."results_public_result_no_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_judge_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "judge_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_by" "uuid",
    "removed_at" timestamp with time zone,
    "removed_by" "uuid",
    "removal_reason" "text",
    CONSTRAINT "schedule_judge_assignments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."schedule_judge_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scoring_criteria" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_id" "uuid",
    "name" "text" NOT NULL,
    "marks" integer NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."scoring_criteria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scoring_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "event_name" "text" NOT NULL,
    "event_name_ml" "text",
    "total_marks" integer DEFAULT 100,
    "time_limit" "text",
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "guidelines" "text",
    "entry_mode" "text" DEFAULT 'criteria'::"text" NOT NULL,
    CONSTRAINT "scoring_rules_entry_mode_check" CHECK (("entry_mode" = ANY (ARRAY['criteria'::"text", 'total_only'::"text"])))
);


ALTER TABLE "public"."scoring_rules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."scoring_rules"."entry_mode" IS 'criteria for paperless criterion-wise scoring; total_only for a single paper-derived total out of 100.';



CREATE TABLE IF NOT EXISTS "public"."stage_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "venue_id" "uuid",
    "token" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."stage_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_api_keys" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "provider" "text" NOT NULL,
    "key_value" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "system_api_keys_provider_check" CHECK (("provider" = ANY (ARRAY['gemini'::"text", 'llama'::"text", 'openai'::"text", 'anthropic'::"text"])))
);


ALTER TABLE "public"."system_api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "event_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."system_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_key" "text" NOT NULL,
    "page_name" "text" NOT NULL,
    "route_path" "text" NOT NULL,
    "category" "text" DEFAULT 'ADMIN'::"text" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "is_critical" boolean DEFAULT false NOT NULL,
    "dependencies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "risk_score" integer DEFAULT 0 NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_pages_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'HIDDEN'::"text", 'LOCKED'::"text", 'MAINTENANCE'::"text"])))
);


ALTER TABLE "public"."system_pages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_leader_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "festival_team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "valid_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "valid_until" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_leader_assignment_valid_window" CHECK ((("valid_until" IS NULL) OR ("valid_until" > "valid_from"))),
    CONSTRAINT "team_leader_assignments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."team_leader_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_portal_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_tenant_id" "uuid" NOT NULL,
    "festival_id" "uuid" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "opens_at" timestamp with time zone,
    "closes_at" timestamp with time zone,
    "maintenance_message" "text",
    "access_disabled_message" "text",
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_portal_settings_configuration_object" CHECK (("jsonb_typeof"("configuration") = 'object'::"text")),
    CONSTRAINT "team_portal_settings_window_check" CHECK ((("closes_at" IS NULL) OR ("opens_at" IS NULL) OR ("closes_at" > "opens_at")))
);


ALTER TABLE "public"."team_portal_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_access_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "actor_role" "text",
    "target_tenant_id" "uuid",
    "target_organisation_id" "uuid",
    "action" "text" NOT NULL,
    "reason" "text",
    "previous_status" "jsonb",
    "new_status" "jsonb",
    "success" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_access_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_agent_prompts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "festival_id" "uuid",
    "prompt_type" "text" DEFAULT 'leaderboard_ui'::"text" NOT NULL,
    "prompt_version" integer DEFAULT 1 NOT NULL,
    "prompt_text" "text" NOT NULL,
    "contract_manifest" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "generated_by" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_agent_prompts_type_check" CHECK (("prompt_type" = 'leaderboard_ui'::"text")),
    CONSTRAINT "tenant_agent_prompts_version_check" CHECK (("prompt_version" > 0))
);


ALTER TABLE "public"."tenant_agent_prompts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_provisioning_operations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operation_type" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "requested_by" "uuid",
    "target_organisation_id" "uuid",
    "target_tenant_id" "uuid",
    "target_user_id" "uuid",
    "admin_email" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "failure_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "tenant_provisioning_operations_operation_type_check" CHECK (("operation_type" = ANY (ARRAY['root_tenant'::"text", 'child_organisation'::"text"]))),
    CONSTRAINT "tenant_provisioning_operations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'validated'::"text", 'auth_user_created'::"text", 'database_linked'::"text", 'completed'::"text", 'failed'::"text", 'compensation_pending'::"text", 'compensated'::"text"])))
);


ALTER TABLE "public"."tenant_provisioning_operations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_terminology" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "org_level_1_label" "text",
    "org_level_2_label" "text",
    "org_level_3_label" "text",
    "org_level_4_label" "text",
    "org_level_5_label" "text",
    "festival_name" "text",
    "organization_name" "text",
    "participant_label" "text",
    "registration_label" "text",
    "result_label" "text",
    "schedule_label" "text",
    "venue_label" "text",
    "judge_label" "text",
    "score_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant_terminology" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "org_type" "text",
    "subscription_status" "text" DEFAULT 'trial'::"text",
    "subscription_end" timestamp with time zone,
    "contact_phone" "text",
    "contact_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organisation_id" "uuid",
    "access_disabled" boolean DEFAULT false NOT NULL,
    "festival_template" "text" DEFAULT 'sahithyolsav'::"text" NOT NULL,
    CONSTRAINT "ck_tenants_festival_template" CHECK (("festival_template" = ANY (ARRAY['sahithyolsav'::"text", 'college_fest'::"text"])))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transfer_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_tenant_id" "uuid",
    "to_tenant_id" "uuid",
    "transfer_method" "text",
    "transferred_by" "uuid",
    "participant_count" integer,
    "status" "text",
    "errors_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."transfer_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_notification_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "token" "text" NOT NULL,
    "device_type" "text",
    "last_seen" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_notification_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."username_login_rate_limits" (
    "scope" "text" NOT NULL,
    "subject_hash" "text" NOT NULL,
    "window_started_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "username_login_rate_limits_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "username_login_rate_limits_scope_check" CHECK (("scope" = ANY (ARRAY['ip'::"text", 'username'::"text"]))),
    CONSTRAINT "username_login_rate_limits_subject_hash_check" CHECK (("length"("subject_hash") = 64))
);


ALTER TABLE "public"."username_login_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."venues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "festival_id" "uuid",
    "name" "text",
    "venue_type" "text",
    "capacity" integer,
    "location" "text"
);


ALTER TABLE "public"."venues" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_public_leaderboard" AS
 SELECT "org"."id" AS "organisation_id",
    COALESCE("org"."name", 'Unassigned'::"text") AS "organisation_name",
    "org"."org_type" AS "organisation_type",
    "org"."parent_id",
    COALESCE("sum"(COALESCE("res"."points_awarded", 0)), (0)::bigint) AS "total_points",
    "count"(*) FILTER (WHERE ("res"."rank" = 1)) AS "first_place_count",
    "count"(*) FILTER (WHERE ("res"."rank" = 2)) AS "second_place_count",
    "count"(*) FILTER (WHERE ("res"."rank" = 3)) AS "third_place_count",
    "count"(*) FILTER (WHERE ("res"."grade" = 'A+'::"text")) AS "grade_a_plus_count",
    "count"(*) FILTER (WHERE ("res"."grade" = 'A'::"text")) AS "grade_a_count",
    "count"(*) FILTER (WHERE ("res"."grade" = 'B'::"text")) AS "grade_b_count",
    "count"(*) FILTER (WHERE ("res"."grade" = 'C'::"text")) AS "grade_c_count",
    "count"(*) AS "result_count",
    "max"("res"."published_at") AS "latest_published_at",
    "res"."festival_id"
   FROM (((("public"."results" "res"
     JOIN "public"."festival_calendar" "festival" ON (("festival"."id" = "res"."festival_id")))
     LEFT JOIN "public"."registrations" "reg" ON (("reg"."id" = "res"."registration_id")))
     LEFT JOIN "public"."participants" "participant" ON (("participant"."id" = "reg"."participant_id")))
     LEFT JOIN "public"."organisations" "org" ON (("org"."id" = COALESCE("reg"."organisation_id", "participant"."organisation_id"))))
  WHERE (("res"."published" IS TRUE) AND ("res"."public_visible" IS TRUE) AND (COALESCE("res"."result_status", 'published'::"text") = 'published'::"text"))
  GROUP BY "org"."id", "org"."name", "org"."org_type", "org"."parent_id", "res"."festival_id";


ALTER VIEW "public"."vw_public_leaderboard" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_public_live_status" AS
 SELECT "festival"."id" AS "festival_id",
    "festival"."custom_name" AS "festival_name",
    "count"(DISTINCT "res"."id") FILTER (WHERE (("res"."published" IS TRUE) AND ("res"."public_visible" IS TRUE) AND (COALESCE("res"."result_status", 'published'::"text") = 'published'::"text"))) AS "published_results_count",
    "count"(DISTINCT "sch"."id") FILTER (WHERE ("sch"."status" = 'live'::"text")) AS "live_stages_count",
    "count"(DISTINCT "sch"."venue_id") FILTER (WHERE ("sch"."status" = 'live'::"text")) AS "active_venues_count",
    "count"(DISTINCT "itm"."id") AS "total_items_count"
   FROM ((("public"."festival_calendar" "festival"
     LEFT JOIN "public"."results" "res" ON ((("res"."festival_id" = "festival"."id") AND ("res"."published" IS TRUE) AND ("res"."public_visible" IS TRUE))))
     LEFT JOIN "public"."schedules" "sch" ON (("sch"."festival_id" = "festival"."id")))
     LEFT JOIN "public"."items" "itm" ON (("itm"."id" = "sch"."item_id")))
  GROUP BY "festival"."id", "festival"."custom_name";


ALTER VIEW "public"."vw_public_live_status" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_public_participants" AS
 SELECT "p"."id" AS "participant_id",
    "p"."festival_id",
    "p"."name" AS "participant_name",
    "p"."chest_number",
    "p"."profile_slug",
    "itm"."item_code",
    "itm"."item_name_en" AS "item_name",
    "itm"."item_name_ml",
        CASE
            WHEN (("res"."published" IS TRUE) AND ("res"."public_visible" IS TRUE)) THEN "res"."rank"
            ELSE NULL::integer
        END AS "rank",
        CASE
            WHEN (("res"."published" IS TRUE) AND ("res"."public_visible" IS TRUE)) THEN "res"."grade"
            ELSE NULL::"text"
        END AS "grade",
        CASE
            WHEN (("res"."published" IS TRUE) AND ("res"."public_visible" IS TRUE)) THEN "res"."points_awarded"
            ELSE 0
        END AS "points_awarded"
   FROM ((("public"."participants" "p"
     LEFT JOIN "public"."registrations" "reg" ON ((("reg"."participant_id" = "p"."id") AND ("reg"."status" IS DISTINCT FROM 'rejected'::"text"))))
     LEFT JOIN "public"."items" "itm" ON (("itm"."id" = "reg"."item_id")))
     LEFT JOIN "public"."results" "res" ON (("res"."registration_id" = "reg"."id")))
  WHERE (("p"."status" = 'approved'::"text") AND (COALESCE("p"."is_terminated", false) = false));


ALTER VIEW "public"."vw_public_participants" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_public_results" AS
 SELECT "res"."id" AS "result_id",
    "res"."registration_id",
    "res"."item_id",
    COALESCE("itm"."item_name_en", ''::"text") AS "item_name",
    COALESCE("itm"."item_name_ml", ''::"text") AS "item_name_ml",
    COALESCE(("itm"."participation_type" = 'group'::"text"), false) AS "is_group",
    COALESCE("itm"."category_codes", ARRAY[]::"text"[]) AS "item_category_codes",
    "org"."id" AS "organisation_id",
    COALESCE("org"."name", 'Unassigned'::"text") AS "organisation_name",
    "org"."org_type" AS "organisation_type",
        CASE
            WHEN COALESCE("participant"."is_terminated", false) THEN NULL::"uuid"
            ELSE "participant"."id"
        END AS "participant_id",
        CASE
            WHEN COALESCE("participant"."is_terminated", false) THEN '[Terminated]'::"text"
            ELSE COALESCE("participant"."name", ''::"text")
        END AS "participant_name",
        CASE
            WHEN COALESCE("participant"."is_terminated", false) THEN ''::"text"
            ELSE COALESCE("participant"."chest_number", ''::"text")
        END AS "chest_number",
    "participant"."category_code" AS "participant_category_code",
    "res"."rank",
    "res"."grade",
    "res"."points_awarded",
    "res"."published_at",
    "res"."festival_id"
   FROM (((("public"."results" "res"
     LEFT JOIN "public"."registrations" "reg" ON (("reg"."id" = "res"."registration_id")))
     LEFT JOIN "public"."items" "itm" ON (("itm"."id" = "res"."item_id")))
     LEFT JOIN "public"."participants" "participant" ON (("participant"."id" = "reg"."participant_id")))
     LEFT JOIN "public"."organisations" "org" ON (("org"."id" = COALESCE("reg"."organisation_id", "participant"."organisation_id"))))
  WHERE (("res"."published" IS TRUE) AND ("res"."public_visible" IS TRUE) AND (COALESCE("res"."result_status", 'published'::"text") = 'published'::"text"));


ALTER VIEW "public"."vw_public_results" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_public_schedule" AS
 SELECT "sch"."id" AS "schedule_id",
    "sch"."festival_id",
    "sch"."item_id",
    "sch"."venue_id",
    "sch"."start_time",
    "sch"."end_time",
    "sch"."status",
    "v"."name" AS "venue_name",
    "v"."location" AS "venue_location",
    "itm"."item_name_en" AS "item_name",
    "itm"."item_name_ml",
    "itm"."item_code",
    "itm"."item_type",
    "itm"."category_codes" AS "item_category_codes",
    ( SELECT "bool_or"((("res"."published" = true) OR ("res"."result_status" = 'published'::"text"))) AS "bool_or"
           FROM "public"."results" "res"
          WHERE ("res"."item_id" = "sch"."item_id")) AS "is_published",
    ( SELECT (EXISTS ( SELECT 1
                   FROM "public"."results" "res"
                  WHERE ("res"."item_id" = "sch"."item_id"))) AS "exists") AS "has_results"
   FROM (("public"."schedules" "sch"
     LEFT JOIN "public"."venues" "v" ON (("v"."id" = "sch"."venue_id")))
     LEFT JOIN "public"."items" "itm" ON (("itm"."id" = "sch"."item_id")));


ALTER VIEW "public"."vw_public_schedule" OWNER TO "postgres";


ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcer_tokens"
    ADD CONSTRAINT "announcer_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcer_tokens"
    ADD CONSTRAINT "announcer_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chest_number_regeneration_audits"
    ADD CONSTRAINT "chest_number_regeneration_audits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."export_jobs"
    ADD CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."festival_calendar"
    ADD CONSTRAINT "festival_calendar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."festival_categories"
    ADD CONSTRAINT "festival_categories_code_unique" UNIQUE ("festival_id", "code");



ALTER TABLE ONLY "public"."festival_categories"
    ADD CONSTRAINT "festival_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."festival_leaderboard_settings"
    ADD CONSTRAINT "festival_leaderboard_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."festival_leaderboard_settings"
    ADD CONSTRAINT "festival_leaderboard_settings_tenant_id_festival_id_key" UNIQUE ("tenant_id", "festival_id");



ALTER TABLE ONLY "public"."festival_teams"
    ADD CONSTRAINT "festival_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."festival_teams"
    ADD CONSTRAINT "festival_teams_unique_mapping" UNIQUE ("festival_id", "organisation_id");



ALTER TABLE ONLY "public"."file_metadata"
    ADD CONSTRAINT "file_metadata_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_posters"
    ADD CONSTRAINT "generated_posters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grace_marks"
    ADD CONSTRAINT "grace_marks_festival_id_org_id_key" UNIQUE ("festival_id", "org_id");



ALTER TABLE ONLY "public"."grace_marks"
    ADD CONSTRAINT "grace_marks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_sessions"
    ADD CONSTRAINT "import_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."judge_activity_logs"
    ADD CONSTRAINT "judge_activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."judge_session_status"
    ADD CONSTRAINT "judge_session_status_judge_id_schedule_id_key" UNIQUE ("judge_id", "schedule_id");



ALTER TABLE ONLY "public"."judge_session_status"
    ADD CONSTRAINT "judge_session_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."judge_tokens"
    ADD CONSTRAINT "judge_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."judge_tokens"
    ADD CONSTRAINT "judge_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."judges"
    ADD CONSTRAINT "judges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mark_entries"
    ADD CONSTRAINT "mark_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organisations"
    ADD CONSTRAINT "organisations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_audit_logs"
    ADD CONSTRAINT "page_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_snapshots"
    ADD CONSTRAINT "page_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participant_unit_audit_logs"
    ADD CONSTRAINT "participant_unit_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participant_unit_batches"
    ADD CONSTRAINT "participant_unit_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."point_table"
    ADD CONSTRAINT "point_table_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."points_config"
    ADD CONSTRAINT "points_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."points_config"
    ADD CONSTRAINT "points_config_tenant_festival_key" UNIQUE ("tenant_id", "festival_id");



COMMENT ON CONSTRAINT "points_config_tenant_festival_key" ON "public"."points_config" IS 'One active points configuration row per tenant and festival; required for deterministic upsert and reads.';



ALTER TABLE ONLY "public"."points_config_versions"
    ADD CONSTRAINT "points_config_versions_festival_id_config_version_key" UNIQUE ("festival_id", "config_version");



ALTER TABLE ONLY "public"."points_config_versions"
    ADD CONSTRAINT "points_config_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poster_approval_requests"
    ADD CONSTRAINT "poster_approval_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poster_drafts"
    ADD CONSTRAINT "poster_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poster_templates"
    ADD CONSTRAINT "poster_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poster_versions"
    ADD CONSTRAINT "poster_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_registration_id_item_id_key" UNIQUE ("registration_id", "item_id");



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_registration_unique" UNIQUE ("registration_id");



ALTER TABLE ONLY "public"."schedule_judge_assignments"
    ADD CONSTRAINT "schedule_judge_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_judge_assignments"
    ADD CONSTRAINT "schedule_judge_assignments_schedule_id_judge_id_key" UNIQUE ("schedule_id", "judge_id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scoring_criteria"
    ADD CONSTRAINT "scoring_criteria_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scoring_rules"
    ADD CONSTRAINT "scoring_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stage_tokens"
    ADD CONSTRAINT "stage_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stage_tokens"
    ADD CONSTRAINT "stage_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."system_api_keys"
    ADD CONSTRAINT "system_api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_events"
    ADD CONSTRAINT "system_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_pages"
    ADD CONSTRAINT "system_pages_page_key_key" UNIQUE ("page_key");



ALTER TABLE ONLY "public"."system_pages"
    ADD CONSTRAINT "system_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_leader_assignments"
    ADD CONSTRAINT "team_leader_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_portal_settings"
    ADD CONSTRAINT "team_portal_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_portal_settings"
    ADD CONSTRAINT "team_portal_settings_unique_festival" UNIQUE ("parent_tenant_id", "festival_id");



ALTER TABLE ONLY "public"."tenant_access_audit_logs"
    ADD CONSTRAINT "tenant_access_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_agent_prompts"
    ADD CONSTRAINT "tenant_agent_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_provisioning_operations"
    ADD CONSTRAINT "tenant_provisioning_operation_operation_type_idempotency_ke_key" UNIQUE ("operation_type", "idempotency_key");



ALTER TABLE ONLY "public"."tenant_provisioning_operations"
    ADD CONSTRAINT "tenant_provisioning_operations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_terminology"
    ADD CONSTRAINT "tenant_terminology_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_terminology"
    ADD CONSTRAINT "tenant_terminology_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transfer_logs"
    ADD CONSTRAINT "transfer_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "unique_email" UNIQUE ("email");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "unique_participant_event" UNIQUE ("participant_id", "item_id");



ALTER TABLE ONLY "public"."mark_entries"
    ADD CONSTRAINT "unique_schedule_judge_registration" UNIQUE ("schedule_id", "judge_id", "registration_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "uq_categories_code" UNIQUE ("code");



ALTER TABLE ONLY "public"."user_notification_tokens"
    ADD CONSTRAINT "user_notification_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notification_tokens"
    ADD CONSTRAINT "user_notification_tokens_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."username_login_rate_limits"
    ADD CONSTRAINT "username_login_rate_limits_pkey" PRIMARY KEY ("scope", "subject_hash");



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_pkey" PRIMARY KEY ("id");



CREATE INDEX "chest_number_regeneration_audits_festival_idx" ON "public"."chest_number_regeneration_audits" USING "btree" ("festival_id", "regenerated_at" DESC);



CREATE UNIQUE INDEX "festival_categories_active_name_unique" ON "public"."festival_categories" USING "btree" ("festival_id", "lower"("btrim"("name"))) WHERE "is_active";



CREATE INDEX "festival_categories_list_idx" ON "public"."festival_categories" USING "btree" ("tenant_id", "festival_id", "is_active", "sort_order", "name");



CREATE INDEX "festival_teams_parent_festival_idx" ON "public"."festival_teams" USING "btree" ("parent_tenant_id", "festival_id") WHERE "is_active";



CREATE INDEX "idx_export_jobs_festival_id" ON "public"."export_jobs" USING "btree" ("festival_id");



CREATE INDEX "idx_export_jobs_status" ON "public"."export_jobs" USING "btree" ("status");



CREATE INDEX "idx_generated_assets_festival_id" ON "public"."generated_assets" USING "btree" ("festival_id");



CREATE INDEX "idx_generated_assets_render_hash" ON "public"."generated_assets" USING "btree" ("render_hash");



CREATE INDEX "idx_generated_assets_result_id" ON "public"."generated_assets" USING "btree" ("result_id");



CREATE INDEX "idx_judge_activity_logs_judge" ON "public"."judge_activity_logs" USING "btree" ("judge_id", "created_at" DESC);



CREATE INDEX "idx_judge_activity_logs_schedule" ON "public"."judge_activity_logs" USING "btree" ("schedule_id", "created_at" DESC);



CREATE INDEX "idx_judge_activity_logs_tenant_created" ON "public"."judge_activity_logs" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_judge_tokens_hash" ON "public"."judge_tokens" USING "btree" ("token_hash") WHERE ("is_revoked" IS NOT TRUE);



CREATE UNIQUE INDEX "idx_orgs_unique_admin_email" ON "public"."organisations" USING "btree" ("lower"("admin_email")) WHERE ("admin_email" IS NOT NULL);



CREATE UNIQUE INDEX "idx_orgs_unique_normalized_admin_email" ON "public"."organisations" USING "btree" ("lower"("btrim"("admin_email"))) WHERE ("admin_email" IS NOT NULL);



CREATE UNIQUE INDEX "idx_orgs_unique_parent_name" ON "public"."organisations" USING "btree" ("parent_id", "lower"(TRIM(BOTH FROM "name"))) WHERE ("parent_id" IS NOT NULL);



CREATE INDEX "idx_page_audit_logs_created_at" ON "public"."page_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_page_audit_logs_page_key" ON "public"."page_audit_logs" USING "btree" ("page_key");



CREATE INDEX "idx_page_snapshots_created_at" ON "public"."page_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_participant_unit_audit_logs_batch_id" ON "public"."participant_unit_audit_logs" USING "btree" ("batch_id");



CREATE INDEX "idx_participant_unit_batches_tenant_id" ON "public"."participant_unit_batches" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_participants_festival_user" ON "public"."participants" USING "btree" ("festival_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_participants_org_category" ON "public"."participants" USING "btree" ("organisation_id", "category_code");



CREATE UNIQUE INDEX "idx_participants_profile_slug" ON "public"."participants" USING "btree" ("profile_slug") WHERE ("profile_slug" IS NOT NULL);



CREATE UNIQUE INDEX "idx_poster_drafts_template_editor" ON "public"."poster_drafts" USING "btree" ("template_id", "editor_id");



CREATE INDEX "idx_provisioning_ops_requested_by" ON "public"."tenant_provisioning_operations" USING "btree" ("requested_by");



CREATE INDEX "idx_provisioning_ops_status" ON "public"."tenant_provisioning_operations" USING "btree" ("status");



CREATE INDEX "idx_registrations_participant" ON "public"."registrations" USING "btree" ("participant_id");



CREATE INDEX "idx_results_schedule_scope" ON "public"."results" USING "btree" ("tenant_id", "festival_id", "schedule_id", "registration_id");



CREATE INDEX "idx_schedule_judge_assignments_active" ON "public"."schedule_judge_assignments" USING "btree" ("schedule_id", "tenant_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_stage_tokens_token" ON "public"."stage_tokens" USING "btree" ("token") WHERE ("is_active" = true);



CREATE INDEX "idx_system_events_tenant_id" ON "public"."system_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_system_pages_category" ON "public"."system_pages" USING "btree" ("category");



CREATE INDEX "idx_system_pages_page_key" ON "public"."system_pages" USING "btree" ("page_key");



CREATE INDEX "idx_system_pages_status" ON "public"."system_pages" USING "btree" ("status");



CREATE INDEX "idx_tenant_access_audit_org" ON "public"."tenant_access_audit_logs" USING "btree" ("target_organisation_id", "created_at" DESC);



CREATE INDEX "idx_tenant_access_audit_tenant" ON "public"."tenant_access_audit_logs" USING "btree" ("target_tenant_id", "created_at" DESC);



CREATE INDEX "idx_tenant_agent_prompts_tenant" ON "public"."tenant_agent_prompts" USING "btree" ("tenant_id", "generated_at" DESC);



CREATE UNIQUE INDEX "idx_unique_code_letter" ON "public"."registrations" USING "btree" ("item_id", "code_letter") WHERE (("code_letter" IS NOT NULL) AND ("status" <> 'rejected'::"text") AND ("is_verified" = true));



CREATE UNIQUE INDEX "poster_drafts_template_editor_idx" ON "public"."poster_drafts" USING "btree" ("template_id", "editor_id");



CREATE INDEX "poster_versions_template_idx" ON "public"."poster_versions" USING "btree" ("template_id");



CREATE UNIQUE INDEX "profiles_team_leader_code_unique" ON "public"."profiles" USING "btree" ("team_leader_code") WHERE ("team_leader_code" IS NOT NULL);



CREATE INDEX "profiles_team_leader_email_idx" ON "public"."profiles" USING "btree" ("team_leader_email") WHERE ("team_leader_email" IS NOT NULL);



CREATE INDEX "team_leader_assignments_user_status_idx" ON "public"."team_leader_assignments" USING "btree" ("user_id", "status", "valid_from", "valid_until");



CREATE UNIQUE INDEX "team_leader_one_active_assignment_per_festival_idx" ON "public"."team_leader_assignments" USING "btree" ("user_id", "festival_team_id") WHERE (("status" = 'active'::"text") AND ("revoked_at" IS NULL));



CREATE UNIQUE INDEX "team_leader_one_active_per_team_idx" ON "public"."team_leader_assignments" USING "btree" ("festival_team_id") WHERE (("status" = 'active'::"text") AND ("revoked_at" IS NULL));



CREATE UNIQUE INDEX "unique_active_chest_number" ON "public"."participants" USING "btree" ("chest_number", "festival_id");



CREATE UNIQUE INDEX "unique_batch_participant" ON "public"."participant_unit_audit_logs" USING "btree" ("batch_id", "participant_id");



CREATE UNIQUE INDEX "unique_registration" ON "public"."registrations" USING "btree" ("participant_id", "item_id", "festival_id");



CREATE UNIQUE INDEX "unique_schedule_slot" ON "public"."schedules" USING "btree" ("festival_id", "venue_id", "item_id", "start_time", "end_time");



CREATE UNIQUE INDEX "uq_active_tenant_leaderboard_agent_prompt" ON "public"."tenant_agent_prompts" USING "btree" ("tenant_id", "prompt_type") WHERE ("is_active" = true);



CREATE OR REPLACE TRIGGER "festival_sync_leaderboard_prompt_context" AFTER INSERT OR UPDATE OF "is_active", "tenant_id" ON "public"."festival_calendar" FOR EACH ROW EXECUTE FUNCTION "public"."_sync_prompt_after_festival_context_change"();



CREATE OR REPLACE TRIGGER "reset_schedule_notification_trigger" BEFORE UPDATE ON "public"."schedules" FOR EACH ROW EXECUTE FUNCTION "public"."reset_schedule_notification"();



CREATE OR REPLACE TRIGGER "schedules_prevent_venue_overlap" BEFORE INSERT OR UPDATE OF "tenant_id", "festival_id", "venue_id", "start_time", "end_time" ON "public"."schedules" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_schedule_venue_overlap"();



CREATE OR REPLACE TRIGGER "sync_profile_to_jwt_trigger" AFTER INSERT OR UPDATE OF "tenant_id", "is_superadmin" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_to_jwt"();



CREATE OR REPLACE TRIGGER "tenant_sync_leaderboard_prompt_name" AFTER UPDATE OF "name" ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."_sync_prompt_after_tenant_name_change"();



CREATE OR REPLACE TRIGGER "tenants_create_default_leaderboard_prompt" AFTER INSERT ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."_create_default_tenant_agent_prompt"();



CREATE OR REPLACE TRIGGER "tenants_sync_leaderboard_prompt_access" AFTER UPDATE OF "access_disabled" ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."_revoke_tenant_leaderboard_prompt"();



CREATE OR REPLACE TRIGGER "trg_audit_judge_token_change" AFTER INSERT OR UPDATE ON "public"."judge_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."audit_judge_token_change"();



CREATE OR REPLACE TRIGGER "trg_audit_schedule_judge_assignment" AFTER INSERT OR UPDATE ON "public"."schedule_judge_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."audit_schedule_judge_assignment"();



CREATE OR REPLACE TRIGGER "trg_candidate_profile_slug" BEFORE INSERT OR UPDATE OF "name", "profile_slug" ON "public"."participants" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_candidate_profile_slug"();



CREATE OR REPLACE TRIGGER "trg_clear_ghost_code_letters" BEFORE UPDATE ON "public"."registrations" FOR EACH ROW WHEN (((("new"."is_verified" = false) AND ("old"."is_verified" = true)) OR (("new"."status" = 'rejected'::"text") AND ("old"."status" <> 'rejected'::"text")))) EXECUTE FUNCTION "public"."clear_ghost_code_letters"();



CREATE OR REPLACE TRIGGER "trg_enforce_active_judge_assignment_for_marks" BEFORE INSERT OR UPDATE ON "public"."mark_entries" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_active_judge_assignment_for_marks"();



CREATE OR REPLACE TRIGGER "trg_enforce_points_config_version" BEFORE UPDATE ON "public"."points_config" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_points_config_version"();



CREATE OR REPLACE TRIGGER "trg_festival_template_immutable" BEFORE UPDATE OF "festival_template" ON "public"."festival_calendar" FOR EACH ROW EXECUTE FUNCTION "public"."reject_festival_template_change"();



CREATE OR REPLACE TRIGGER "trg_festival_template_snapshot" BEFORE INSERT ON "public"."festival_calendar" FOR EACH ROW EXECUTE FUNCTION "public"."snapshot_festival_template_from_tenant"();



CREATE OR REPLACE TRIGGER "trg_snapshot_points_config_version" AFTER INSERT OR UPDATE ON "public"."points_config" FOR EACH ROW EXECUTE FUNCTION "public"."snapshot_points_config_version"();



CREATE OR REPLACE TRIGGER "trg_sync_festival_year" BEFORE INSERT OR UPDATE OF "start_date", "festival_year" ON "public"."festival_calendar" FOR EACH ROW EXECUTE FUNCTION "public"."sync_festival_year_from_start_date"();



CREATE OR REPLACE TRIGGER "trg_validate_festival_category_row" BEFORE INSERT OR UPDATE ON "public"."festival_categories" FOR EACH ROW EXECUTE FUNCTION "public"."validate_festival_category_row"();



CREATE OR REPLACE TRIGGER "trg_validate_festival_team_mapping" BEFORE INSERT OR UPDATE OF "parent_tenant_id", "festival_id", "organisation_id" ON "public"."festival_teams" FOR EACH ROW EXECUTE FUNCTION "public"."validate_festival_team_mapping"();



CREATE OR REPLACE TRIGGER "trg_validate_item_categories_for_template" BEFORE INSERT OR UPDATE OF "festival_id", "category_codes" ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."validate_item_categories_for_template"();



COMMENT ON TRIGGER "trg_validate_item_categories_for_template" ON "public"."items" IS 'Enforces College Fest canonical item categories on insert or when festival_id/category_codes change (Migration 103).';



CREATE OR REPLACE TRIGGER "trg_validate_participant_category" BEFORE INSERT OR UPDATE ON "public"."participants" FOR EACH ROW EXECUTE FUNCTION "public"."validate_participant_category"();



CREATE OR REPLACE TRIGGER "trg_validate_registration_category_compatibility" BEFORE INSERT OR UPDATE OF "festival_id", "participant_id", "item_id" ON "public"."registrations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_registration_category_compatibility"();



COMMENT ON TRIGGER "trg_validate_registration_category_compatibility" ON "public"."registrations" IS 'Enforces College Fest registration/participant/item category compatibility on insert or when festival_id/participant_id/item_id change (Migration 104).';



CREATE OR REPLACE TRIGGER "trg_validate_result_points_snapshot" BEFORE INSERT OR UPDATE ON "public"."results" FOR EACH ROW EXECUTE FUNCTION "public"."validate_result_points_snapshot"();



CREATE OR REPLACE TRIGGER "trg_validate_team_leader_assignment" BEFORE INSERT OR UPDATE OF "festival_team_id", "user_id", "status", "valid_from", "valid_until" ON "public"."team_leader_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_team_leader_assignment"();



CREATE OR REPLACE TRIGGER "trig_auto_category" BEFORE INSERT OR UPDATE ON "public"."participants" FOR EACH ROW EXECUTE FUNCTION "public"."auto_set_category"();



CREATE OR REPLACE TRIGGER "trig_participants_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."participants" FOR EACH ROW EXECUTE FUNCTION "public"."audit_participant_changes"();



CREATE OR REPLACE TRIGGER "trigger_assign_public_result_no" BEFORE UPDATE ON "public"."results" FOR EACH ROW EXECUTE FUNCTION "public"."assign_public_result_no"();



CREATE OR REPLACE TRIGGER "trigger_assign_public_result_no_insert" BEFORE INSERT ON "public"."results" FOR EACH ROW EXECUTE FUNCTION "public"."assign_public_result_no_insert"();



CREATE OR REPLACE TRIGGER "update_judge_session_status_modtime" BEFORE UPDATE ON "public"."judge_session_status" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "update_leaderboard_settings_modtime" BEFORE UPDATE ON "public"."festival_leaderboard_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_poster_templates_modtime" BEFORE UPDATE ON "public"."poster_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_system_pages_modtime" BEFORE UPDATE ON "public"."system_pages" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "validate_mark_entry_scoring_trigger" BEFORE INSERT OR UPDATE ON "public"."mark_entries" FOR EACH ROW EXECUTE FUNCTION "public"."validate_mark_entry_scoring"();



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."announcer_tokens"
    ADD CONSTRAINT "announcer_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."announcer_tokens"
    ADD CONSTRAINT "announcer_tokens_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcer_tokens"
    ADD CONSTRAINT "announcer_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id");



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id");



ALTER TABLE ONLY "public"."certificates"
    ADD CONSTRAINT "certificates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."chest_number_regeneration_audits"
    ADD CONSTRAINT "chest_number_regeneration_audits_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chest_number_regeneration_audits"
    ADD CONSTRAINT "chest_number_regeneration_audits_regenerated_by_fkey" FOREIGN KEY ("regenerated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chest_number_regeneration_audits"
    ADD CONSTRAINT "chest_number_regeneration_audits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."export_jobs"
    ADD CONSTRAINT "export_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."export_jobs"
    ADD CONSTRAINT "export_jobs_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."export_jobs"
    ADD CONSTRAINT "export_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."festival_calendar"
    ADD CONSTRAINT "festival_calendar_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."festival_categories"
    ADD CONSTRAINT "festival_categories_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."festival_categories"
    ADD CONSTRAINT "festival_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."festival_leaderboard_settings"
    ADD CONSTRAINT "festival_leaderboard_settings_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."festival_leaderboard_settings"
    ADD CONSTRAINT "festival_leaderboard_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."festival_teams"
    ADD CONSTRAINT "festival_teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."festival_teams"
    ADD CONSTRAINT "festival_teams_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."festival_teams"
    ADD CONSTRAINT "festival_teams_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id");



ALTER TABLE ONLY "public"."festival_teams"
    ADD CONSTRAINT "festival_teams_parent_tenant_id_fkey" FOREIGN KEY ("parent_tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."file_metadata"
    ADD CONSTRAINT "file_metadata_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."file_metadata"
    ADD CONSTRAINT "file_metadata_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."file_metadata"
    ADD CONSTRAINT "file_metadata_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_posters"
    ADD CONSTRAINT "generated_posters_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_posters"
    ADD CONSTRAINT "generated_posters_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."poster_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_posters"
    ADD CONSTRAINT "generated_posters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grace_marks"
    ADD CONSTRAINT "grace_marks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."grace_marks"
    ADD CONSTRAINT "grace_marks_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."grace_marks"
    ADD CONSTRAINT "grace_marks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id");



ALTER TABLE ONLY "public"."grace_marks"
    ADD CONSTRAINT "grace_marks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."grace_marks"
    ADD CONSTRAINT "grace_marks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id");



ALTER TABLE ONLY "public"."import_sessions"
    ADD CONSTRAINT "import_sessions_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_sessions"
    ADD CONSTRAINT "import_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."judge_activity_logs"
    ADD CONSTRAINT "judge_activity_logs_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "public"."judges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."judge_activity_logs"
    ADD CONSTRAINT "judge_activity_logs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."judge_activity_logs"
    ADD CONSTRAINT "judge_activity_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."judge_activity_logs"
    ADD CONSTRAINT "judge_activity_logs_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "public"."judge_tokens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."judge_session_status"
    ADD CONSTRAINT "judge_session_status_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "public"."judges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."judge_session_status"
    ADD CONSTRAINT "judge_session_status_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."judge_session_status"
    ADD CONSTRAINT "judge_session_status_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."judges"
    ADD CONSTRAINT "judges_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."judges"
    ADD CONSTRAINT "judges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."mark_entries"
    ADD CONSTRAINT "mark_entries_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "public"."judges"("id");



ALTER TABLE ONLY "public"."mark_entries"
    ADD CONSTRAINT "mark_entries_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id");



ALTER TABLE ONLY "public"."mark_entries"
    ADD CONSTRAINT "mark_entries_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id");



ALTER TABLE ONLY "public"."mark_entries"
    ADD CONSTRAINT "mark_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."mark_entries"
    ADD CONSTRAINT "mark_entries_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "public"."judge_tokens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organisations"
    ADD CONSTRAINT "organisations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."organisations"("id");



ALTER TABLE ONLY "public"."organisations"
    ADD CONSTRAINT "organisations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."page_audit_logs"
    ADD CONSTRAINT "page_audit_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."page_snapshots"
    ADD CONSTRAINT "page_snapshots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."participant_unit_audit_logs"
    ADD CONSTRAINT "participant_unit_audit_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."participant_unit_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_unit_audit_logs"
    ADD CONSTRAINT "participant_unit_audit_logs_new_unit_id_fkey" FOREIGN KEY ("new_unit_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."participant_unit_audit_logs"
    ADD CONSTRAINT "participant_unit_audit_logs_old_unit_id_fkey" FOREIGN KEY ("old_unit_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."participant_unit_audit_logs"
    ADD CONSTRAINT "participant_unit_audit_logs_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_unit_audit_logs"
    ADD CONSTRAINT "participant_unit_audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_unit_batches"
    ADD CONSTRAINT "participant_unit_batches_target_unit_id_fkey" FOREIGN KEY ("target_unit_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."participant_unit_batches"
    ADD CONSTRAINT "participant_unit_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."participants"
    ADD CONSTRAINT "participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."point_table"
    ADD CONSTRAINT "point_table_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."point_table"
    ADD CONSTRAINT "point_table_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."points_config"
    ADD CONSTRAINT "points_config_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."points_config"
    ADD CONSTRAINT "points_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."points_config_versions"
    ADD CONSTRAINT "points_config_versions_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."points_config_versions"
    ADD CONSTRAINT "points_config_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."poster_approval_requests"
    ADD CONSTRAINT "poster_approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."poster_approval_requests"
    ADD CONSTRAINT "poster_approval_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."poster_approval_requests"
    ADD CONSTRAINT "poster_approval_requests_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."poster_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."poster_drafts"
    ADD CONSTRAINT "poster_drafts_editor_id_fkey" FOREIGN KEY ("editor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."poster_drafts"
    ADD CONSTRAINT "poster_drafts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."poster_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."poster_templates"
    ADD CONSTRAINT "poster_templates_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."poster_templates"
    ADD CONSTRAINT "poster_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."poster_versions"
    ADD CONSTRAINT "poster_versions_editor_id_fkey" FOREIGN KEY ("editor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."poster_versions"
    ADD CONSTRAINT "poster_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."poster_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id");



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id");



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."schedule_judge_assignments"
    ADD CONSTRAINT "schedule_judge_assignments_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "public"."judges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_judge_assignments"
    ADD CONSTRAINT "schedule_judge_assignments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_judge_assignments"
    ADD CONSTRAINT "schedule_judge_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_shuffle_locked_by_fkey" FOREIGN KEY ("shuffle_locked_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id");



ALTER TABLE ONLY "public"."scoring_criteria"
    ADD CONSTRAINT "scoring_criteria_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."scoring_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scoring_rules"
    ADD CONSTRAINT "scoring_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."stage_tokens"
    ADD CONSTRAINT "stage_tokens_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stage_tokens"
    ADD CONSTRAINT "stage_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stage_tokens"
    ADD CONSTRAINT "stage_tokens_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_events"
    ADD CONSTRAINT "system_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_pages"
    ADD CONSTRAINT "system_pages_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_leader_assignments"
    ADD CONSTRAINT "team_leader_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."team_leader_assignments"
    ADD CONSTRAINT "team_leader_assignments_festival_team_id_fkey" FOREIGN KEY ("festival_team_id") REFERENCES "public"."festival_teams"("id");



ALTER TABLE ONLY "public"."team_leader_assignments"
    ADD CONSTRAINT "team_leader_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."team_portal_settings"
    ADD CONSTRAINT "team_portal_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."team_portal_settings"
    ADD CONSTRAINT "team_portal_settings_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."team_portal_settings"
    ADD CONSTRAINT "team_portal_settings_parent_tenant_id_fkey" FOREIGN KEY ("parent_tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."team_portal_settings"
    ADD CONSTRAINT "team_portal_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tenant_agent_prompts"
    ADD CONSTRAINT "tenant_agent_prompts_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenant_agent_prompts"
    ADD CONSTRAINT "tenant_agent_prompts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_terminology"
    ADD CONSTRAINT "tenant_terminology_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id");



ALTER TABLE ONLY "public"."user_notification_tokens"
    ADD CONSTRAINT "user_notification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "public"."festival_calendar"("id");



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



CREATE POLICY "Admins can insert audit logs" ON "public"."page_audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Admins can insert own tenant organisations" ON "public"."organisations" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage approval requests" ON "public"."poster_approval_requests" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'tenant_admin'::"text", 'admin'::"text"])) OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Admins can manage export_jobs" ON "public"."export_jobs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'tenant_admin'::"text", 'admin'::"text"])) OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Admins can manage generated posters" ON "public"."generated_posters" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'tenant_admin'::"text", 'admin'::"text"])) OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Admins can manage generated_assets" ON "public"."generated_assets" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'tenant_admin'::"text", 'admin'::"text"])) OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Admins can manage judge tokens" ON "public"."judge_tokens" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage judge_activity_logs" ON "public"."judge_activity_logs" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage judge_session_status" ON "public"."judge_session_status" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage judges" ON "public"."judges" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage poster templates" ON "public"."poster_templates" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'tenant_admin'::"text", 'admin'::"text"])) OR ("profiles"."is_superadmin" = true)) AND (("profiles"."tenant_id" = "poster_templates"."tenant_id") OR ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])) OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Admins can manage poster versions" ON "public"."poster_versions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'tenant_admin'::"text", 'admin'::"text"])) OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Admins can manage snapshots" ON "public"."page_snapshots" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Admins can manage stage tokens" ON "public"."stage_tokens" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage their own announcements" ON "public"."announcements" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage their own attendance" ON "public"."attendance" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage their own audit_logs" ON "public"."audit_logs" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage their own certificates" ON "public"."certificates" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage their own participants" ON "public"."participants" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage their own point_table" ON "public"."point_table" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage their own points_config" ON "public"."points_config" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage their own schedules" ON "public"."schedules" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage their own transfer_logs" ON "public"."transfer_logs" TO "authenticated" USING ((("from_tenant_id" = "public"."get_my_tenant_id"()) OR ("to_tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("from_tenant_id" = "public"."get_my_tenant_id"()) OR ("to_tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can manage their own venues" ON "public"."venues" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can see own and child organisations" ON "public"."organisations" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR ("parent_id" = "public"."get_my_org_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can update own tenant organisations" ON "public"."organisations" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Admins can update page status" ON "public"."system_pages" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."is_superadmin" = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Admins can view all logs in their tenant" ON "public"."notification_logs" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."notifications" "n"
  WHERE (("n"."id" = "notification_logs"."notification_id") AND ("n"."tenant_id" = "public"."get_my_tenant_id"())))) AND ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'admin_leader'::"text", 'superadmin'::"text"]))))) OR "public"."is_superadmin"())));



CREATE POLICY "Admins can view all pages" ON "public"."system_pages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Admins can view and create notifications" ON "public"."notifications" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) AND ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'admin_leader'::"text", 'superadmin'::"text"]))))) OR "public"."is_superadmin"())));



CREATE POLICY "Admins can view audit logs" ON "public"."page_audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."is_superadmin" = true))))));



CREATE POLICY "Authenticated users can read certificates" ON "public"."file_metadata" FOR SELECT TO "authenticated" USING (("asset_type" = 'certificate'::"text"));



CREATE POLICY "Editors can manage their own drafts" ON "public"."poster_drafts" TO "authenticated" USING (("editor_id" = "auth"."uid"()));



CREATE POLICY "Enable all access for admins" ON "public"."scoring_rules" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



CREATE POLICY "Enable all access for admins based on tenant_id" ON "public"."file_metadata" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Enable all access for admins cr" ON "public"."scoring_criteria" USING (("public"."is_superadmin"() OR (EXISTS ( SELECT 1
   FROM "public"."scoring_rules" "sr"
  WHERE (("sr"."id" = "scoring_criteria"."rule_id") AND ("sr"."tenant_id" = "public"."get_my_tenant_id"()))))));



CREATE POLICY "Enable read access for all" ON "public"."scoring_rules" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all cr" ON "public"."scoring_criteria" FOR SELECT USING (true);



CREATE POLICY "Insert policy for participant_unit_audit_logs" ON "public"."participant_unit_audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Insert policy for participant_unit_batches" ON "public"."participant_unit_batches" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Insert policy for system_events" ON "public"."system_events" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Judges can view public and judge pages" ON "public"."system_pages" FOR SELECT TO "authenticated" USING ((("category" = ANY (ARRAY['PUBLIC'::"text", 'JUDGE'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'judge'::"text") AND (NOT "profiles"."is_superadmin"))))));



CREATE POLICY "Leaderboard settings admins can insert" ON "public"."festival_leaderboard_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'tenant_admin'::"text", 'festival_admin'::"text", 'admin'::"text"])) AND (("profiles"."role" = 'super_admin'::"text") OR ("profiles"."tenant_id" = "festival_leaderboard_settings"."tenant_id"))))));



CREATE POLICY "Leaderboard settings admins can read" ON "public"."festival_leaderboard_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'tenant_admin'::"text", 'festival_admin'::"text", 'admin'::"text"])) AND (("profiles"."role" = 'super_admin'::"text") OR ("profiles"."tenant_id" = "festival_leaderboard_settings"."tenant_id"))))));



CREATE POLICY "Leaderboard settings admins can update" ON "public"."festival_leaderboard_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'tenant_admin'::"text", 'festival_admin'::"text", 'admin'::"text"])) AND (("profiles"."role" = 'super_admin'::"text") OR ("profiles"."tenant_id" = "festival_leaderboard_settings"."tenant_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'tenant_admin'::"text", 'festival_admin'::"text", 'admin'::"text"])) AND (("profiles"."role" = 'super_admin'::"text") OR ("profiles"."tenant_id" = "festival_leaderboard_settings"."tenant_id"))))));



CREATE POLICY "Provisioning ops visible to requester or superadmin" ON "public"."tenant_provisioning_operations" FOR SELECT TO "authenticated" USING ((("requested_by" = "auth"."uid"()) OR "public"."is_superadmin"()));



CREATE POLICY "Public can read generated posters" ON "public"."generated_posters" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public can read public assets" ON "public"."file_metadata" FOR SELECT USING ((("visibility" = 'public'::"text") OR ("is_public" = true)));



CREATE POLICY "Public can read visible leaderboard settings" ON "public"."festival_leaderboard_settings" FOR SELECT TO "authenticated", "anon" USING (("is_public_visible" = true));



CREATE POLICY "Public can view active announcer tokens" ON "public"."announcer_tokens" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can view public pages only" ON "public"."system_pages" FOR SELECT TO "anon" USING (("category" = 'PUBLIC'::"text"));



CREATE POLICY "Select policy for participant_unit_audit_logs" ON "public"."participant_unit_audit_logs" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Select policy for participant_unit_batches" ON "public"."participant_unit_batches" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Select policy for system_events" ON "public"."system_events" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Super admin delete access to API keys" ON "public"."system_api_keys" FOR DELETE TO "authenticated" USING ("public"."is_superadmin"());



CREATE POLICY "Super admin full access to terminology" ON "public"."tenant_terminology" TO "authenticated" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "Super admin insert access to API keys" ON "public"."system_api_keys" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "Super admin read access to API keys" ON "public"."system_api_keys" FOR SELECT TO "authenticated" USING ("public"."is_superadmin"());



CREATE POLICY "Super admin update access to API keys" ON "public"."system_api_keys" FOR UPDATE TO "authenticated" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "Superadmins can see all profiles" ON "public"."profiles" TO "authenticated" USING ("public"."is_superadmin"());



CREATE POLICY "Superadmins can see all tenants" ON "public"."tenants" TO "authenticated" USING ("public"."is_superadmin"());



CREATE POLICY "Superadmins full control organisations" ON "public"."organisations" TO "authenticated" USING ("public"."is_superadmin"());



CREATE POLICY "Superadmins read tenant access audit" ON "public"."tenant_access_audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_superadmin"());



CREATE POLICY "Superadmins read tenant agent prompts" ON "public"."tenant_agent_prompts" FOR SELECT TO "authenticated" USING ("public"."is_superadmin"());



CREATE POLICY "Tenant admin read own terminology" ON "public"."tenant_terminology" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant_id"()));



CREATE POLICY "Tenant admin update own terminology" ON "public"."tenant_terminology" FOR UPDATE TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant_id"())) WITH CHECK (("tenant_id" = "public"."get_my_tenant_id"()));



CREATE POLICY "Tenant admins can create points config versions" ON "public"."points_config_versions" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Tenant admins can manage announcer tokens" ON "public"."announcer_tokens" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



CREATE POLICY "Tenant admins can manage schedule judge assignments" ON "public"."schedule_judge_assignments" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Tenant admins can read judge activity logs" ON "public"."judge_activity_logs" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Tenant admins can read points config versions" ON "public"."points_config_versions" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Tenant isolation for group members" ON "public"."group_members" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."registrations" "r"
  WHERE (("r"."id" = "group_members"."registration_id") AND ("r"."tenant_id" = "public"."get_my_tenant_id"())))) OR "public"."is_superadmin"())) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."registrations" "r"
  WHERE (("r"."id" = "group_members"."registration_id") AND ("r"."tenant_id" = "public"."get_my_tenant_id"())))) OR "public"."is_superadmin"()));



CREATE POLICY "Tenant members can manage mark entries" ON "public"."mark_entries" TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Tenant members can read schedule judge assignments" ON "public"."schedule_judge_assignments" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Update policy for participant_unit_audit_logs" ON "public"."participant_unit_audit_logs" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Update policy for participant_unit_batches" ON "public"."participant_unit_batches" FOR UPDATE TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Users can manage import_sessions" ON "public"."import_sessions" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"())) WITH CHECK ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Users can manage their own tokens" ON "public"."user_notification_tokens" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can see their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can see their own tenant record" ON "public"."tenants" FOR SELECT TO "authenticated" USING (("id" = "public"."get_my_tenant_id"()));



CREATE POLICY "Users can update own logs" ON "public"."notification_logs" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own non-privileged profile fields" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK ((("auth"."uid"() = "id") AND (NOT ("role" IS DISTINCT FROM ( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))) AND (NOT ("tenant_id" IS DISTINCT FROM ( SELECT "profiles_1"."tenant_id"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))) AND (NOT ("is_superadmin" IS DISTINCT FROM ( SELECT "profiles_1"."is_superadmin"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view notifications for their tenant" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("tenant_id" IS NULL) OR ("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "Users can view own logs" ON "public"."notification_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "View local or global calendar" ON "public"."festival_calendar" FOR SELECT TO "authenticated" USING ((("tenant_id" IS NULL) OR ("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "View local or global categories" ON "public"."categories" FOR SELECT TO "authenticated" USING ((("tenant_id" IS NULL) OR ("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "announcements_delete_policy" ON "public"."announcements" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "announcements_insert_policy" ON "public"."announcements" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "announcements_select_policy" ON "public"."announcements" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "announcements_update_policy" ON "public"."announcements" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."announcer_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_tenant_access" ON "public"."attendance" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_delete_policy" ON "public"."audit_logs" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "audit_logs_insert_policy" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "audit_logs_select_policy" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "audit_logs_update_policy" ON "public"."audit_logs" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_delete" ON "public"."categories" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "categories_delete_policy" ON "public"."categories" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "categories_insert" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "categories_insert_policy" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "categories_select" ON "public"."categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "categories_select_policy" ON "public"."categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "categories_update" ON "public"."categories" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "categories_update_policy" ON "public"."categories" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."certificates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "certificates_delete_policy" ON "public"."certificates" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "certificates_insert_policy" ON "public"."certificates" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "certificates_select_policy" ON "public"."certificates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "certificates_update_policy" ON "public"."certificates" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."chest_number_regeneration_audits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chest_number_regeneration_audits_read" ON "public"."chest_number_regeneration_audits" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "deny_team_leader_direct_announcements" ON "public"."announcements" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_attendance" ON "public"."attendance" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_categories" ON "public"."categories" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_festival_calendar" ON "public"."festival_calendar" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_group_members" ON "public"."group_members" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_items" ON "public"."items" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_mark_entries" ON "public"."mark_entries" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_organisations" ON "public"."organisations" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_participants" ON "public"."participants" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_point_table" ON "public"."point_table" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_profiles" ON "public"."profiles" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_registrations" ON "public"."registrations" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_results" ON "public"."results" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_schedules" ON "public"."schedules" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_tenants" ON "public"."tenants" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



CREATE POLICY "deny_team_leader_direct_venues" ON "public"."venues" AS RESTRICTIVE TO "authenticated" USING ((NOT "public"."is_team_leader"())) WITH CHECK ((NOT "public"."is_team_leader"()));



ALTER TABLE "public"."export_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."festival_calendar" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "festival_calendar_tenant_manage" ON "public"."festival_calendar" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



CREATE POLICY "festival_calendar_tenant_read" ON "public"."festival_calendar" FOR SELECT TO "authenticated" USING ((("tenant_id" IS NULL) OR ("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



ALTER TABLE "public"."festival_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "festival_categories_insert_admin" ON "public"."festival_categories" FOR INSERT TO "authenticated" WITH CHECK (((("tenant_id" = "public"."get_my_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))) OR "public"."is_superadmin"()));



CREATE POLICY "festival_categories_select_tenant" ON "public"."festival_categories" FOR SELECT TO "authenticated" USING ((("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



CREATE POLICY "festival_categories_update_admin" ON "public"."festival_categories" FOR UPDATE TO "authenticated" USING (((("tenant_id" = "public"."get_my_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))) OR "public"."is_superadmin"())) WITH CHECK (((("tenant_id" = "public"."get_my_tenant_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))) OR "public"."is_superadmin"()));



ALTER TABLE "public"."festival_leaderboard_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."festival_teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "festival_teams_admin_manage" ON "public"."festival_teams" TO "authenticated" USING (("public"."is_superadmin"() OR ("parent_tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("parent_tenant_id" = "public"."get_my_tenant_id"())));



CREATE POLICY "festival_teams_team_leader_read" ON "public"."festival_teams" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."team_leader_assignments" "a"
  WHERE (("a"."festival_team_id" = "a"."id") AND ("a"."user_id" = "auth"."uid"()) AND ("a"."status" = 'active'::"text") AND ("a"."revoked_at" IS NULL)))));



ALTER TABLE "public"."file_metadata" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_posters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grace_marks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "grace_marks_tenant_access" ON "public"."grace_marks" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_members_delete_policy" ON "public"."group_members" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "group_members_insert_policy" ON "public"."group_members" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "group_members_select_policy" ON "public"."group_members" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "group_members_update_policy" ON "public"."group_members" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."import_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "items_tenant_manage" ON "public"."items" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



CREATE POLICY "items_tenant_read" ON "public"."items" FOR SELECT TO "authenticated" USING ((("tenant_id" IS NULL) OR ("tenant_id" = "public"."get_my_tenant_id"()) OR "public"."is_superadmin"()));



ALTER TABLE "public"."judge_activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."judge_session_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."judge_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."judges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "judges_tenant_access" ON "public"."judges" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



ALTER TABLE "public"."mark_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organisations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participant_unit_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participant_unit_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participants_delete_policy" ON "public"."participants" FOR DELETE TO "authenticated" USING (("public"."is_org_visible"("organisation_id") OR "public"."is_superadmin"()));



CREATE POLICY "participants_insert_policy" ON "public"."participants" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_org_visible"("organisation_id") OR "public"."is_superadmin"()));



CREATE POLICY "participants_select_policy" ON "public"."participants" FOR SELECT TO "authenticated" USING (("public"."is_org_visible"("organisation_id") OR "public"."is_superadmin"()));



CREATE POLICY "participants_update_policy" ON "public"."participants" FOR UPDATE TO "authenticated" USING (("public"."is_org_visible"("organisation_id") OR "public"."is_superadmin"())) WITH CHECK (("public"."is_org_visible"("organisation_id") OR "public"."is_superadmin"()));



ALTER TABLE "public"."point_table" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "point_table_tenant_access" ON "public"."point_table" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



ALTER TABLE "public"."points_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "points_config_delete_policy" ON "public"."points_config" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "points_config_insert_policy" ON "public"."points_config" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "points_config_select_policy" ON "public"."points_config" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "points_config_update_policy" ON "public"."points_config" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."points_config_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."poster_approval_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."poster_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."poster_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."poster_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "registrations_delete_policy" ON "public"."registrations" FOR DELETE TO "authenticated" USING (("public"."is_org_visible"("organisation_id") OR "public"."is_superadmin"()));



CREATE POLICY "registrations_insert_policy" ON "public"."registrations" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_org_visible"("organisation_id") OR "public"."is_superadmin"()));



CREATE POLICY "registrations_select_policy" ON "public"."registrations" FOR SELECT TO "authenticated" USING (("public"."is_org_visible"("organisation_id") OR "public"."is_superadmin"()));



CREATE POLICY "registrations_update_policy" ON "public"."registrations" FOR UPDATE TO "authenticated" USING (("public"."is_org_visible"("organisation_id") OR "public"."is_superadmin"())) WITH CHECK (("public"."is_org_visible"("organisation_id") OR "public"."is_superadmin"()));



ALTER TABLE "public"."results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "results_tenant_access" ON "public"."results" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



ALTER TABLE "public"."schedule_judge_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scoring_criteria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scoring_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stage_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_pages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_foundation_announcements_tenant_access" ON "public"."announcements" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



CREATE POLICY "team_foundation_attendance_tenant_access" ON "public"."attendance" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



CREATE POLICY "team_foundation_group_members_tenant_access" ON "public"."group_members" TO "authenticated" USING (("public"."is_superadmin"() OR (EXISTS ( SELECT 1
   FROM "public"."registrations" "r"
  WHERE (("r"."id" = "group_members"."registration_id") AND ("r"."tenant_id" = "public"."get_my_tenant_id"())))))) WITH CHECK (("public"."is_superadmin"() OR (EXISTS ( SELECT 1
   FROM "public"."registrations" "r"
  WHERE (("r"."id" = "group_members"."registration_id") AND ("r"."tenant_id" = "public"."get_my_tenant_id"()))))));



CREATE POLICY "team_foundation_point_table_tenant_access" ON "public"."point_table" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



CREATE POLICY "team_foundation_public_schedule_read" ON "public"."schedules" FOR SELECT TO "anon" USING ((("status" = ANY (ARRAY['scheduled'::"text", 'ongoing'::"text", 'in_progress'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."festival_calendar" "f"
  WHERE (("f"."id" = "schedules"."festival_id") AND ("f"."is_active" IS TRUE))))));



CREATE POLICY "team_foundation_public_venue_read" ON "public"."venues" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."schedules" "s"
  WHERE (("s"."venue_id" = "venues"."id") AND ("s"."status" = ANY (ARRAY['scheduled'::"text", 'ongoing'::"text", 'in_progress'::"text"])) AND (EXISTS ( SELECT 1
           FROM "public"."festival_calendar" "f"
          WHERE (("f"."id" = "s"."festival_id") AND ("f"."is_active" IS TRUE))))))));



CREATE POLICY "team_foundation_schedules_tenant_access" ON "public"."schedules" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



CREATE POLICY "team_foundation_venues_tenant_access" ON "public"."venues" TO "authenticated" USING (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("tenant_id" = "public"."get_my_tenant_id"())));



ALTER TABLE "public"."team_leader_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_leader_assignments_admin_manage" ON "public"."team_leader_assignments" TO "authenticated" USING (("public"."is_superadmin"() OR "public"."check_festival_team_admin"("festival_team_id"))) WITH CHECK (("public"."is_superadmin"() OR "public"."check_festival_team_admin"("festival_team_id")));



CREATE POLICY "team_leader_assignments_self_read" ON "public"."team_leader_assignments" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."team_portal_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_portal_settings_admin_manage" ON "public"."team_portal_settings" TO "authenticated" USING (("public"."is_superadmin"() OR ("parent_tenant_id" = "public"."get_my_tenant_id"()))) WITH CHECK (("public"."is_superadmin"() OR ("parent_tenant_id" = "public"."get_my_tenant_id"())));



CREATE POLICY "team_portal_settings_team_leader_read" ON "public"."team_portal_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."team_leader_assignments" "a"
     JOIN "public"."festival_teams" "ft" ON (("ft"."id" = "a"."festival_team_id")))
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."status" = 'active'::"text") AND ("a"."revoked_at" IS NULL) AND ("ft"."parent_tenant_id" = "ft"."parent_tenant_id") AND ("ft"."festival_id" = "ft"."festival_id")))));



ALTER TABLE "public"."tenant_access_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_agent_prompts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_provisioning_operations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_terminology" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_delete" ON "public"."tenants" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "tenants_delete_policy" ON "public"."tenants" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "tenants_insert" ON "public"."tenants" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "tenants_insert_policy" ON "public"."tenants" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "tenants_select" ON "public"."tenants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tenants_select_policy" ON "public"."tenants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tenants_update" ON "public"."tenants" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "tenants_update_policy" ON "public"."tenants" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."transfer_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transfer_logs_delete_policy" ON "public"."transfer_logs" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "transfer_logs_insert_policy" ON "public"."transfer_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "transfer_logs_select_policy" ON "public"."transfer_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "transfer_logs_update_policy" ON "public"."transfer_logs" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."user_notification_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."username_login_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."venues" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."_assert_import_access"("p_target_tenant_id" "uuid", "p_target_festival_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_assert_import_access"("p_target_tenant_id" "uuid", "p_target_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_assert_import_access"("p_target_tenant_id" "uuid", "p_target_festival_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_assert_organisation_hierarchy_access"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_assert_organisation_hierarchy_access"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_assert_superadmin_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_assert_superadmin_access"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_create_default_tenant_agent_prompt"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_create_default_tenant_agent_prompt"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_provisioning_get_op"("p_operation_type" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_provisioning_get_op"("p_operation_type" "text", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_provisioning_get_org"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_provisioning_get_org"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_provisioning_link_profile"("p_user_id" "uuid", "p_tenant_id" "uuid", "p_full_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_provisioning_link_profile"("p_user_id" "uuid", "p_tenant_id" "uuid", "p_full_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_provisioning_upsert_op"("p_operation_type" "text", "p_idempotency_key" "text", "p_status" "text", "p_requested_by" "uuid", "p_target_organisation_id" "uuid", "p_target_tenant_id" "uuid", "p_target_user_id" "uuid", "p_admin_email" "text", "p_failure_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_provisioning_upsert_op"("p_operation_type" "text", "p_idempotency_key" "text", "p_status" "text", "p_requested_by" "uuid", "p_target_organisation_id" "uuid", "p_target_tenant_id" "uuid", "p_target_user_id" "uuid", "p_admin_email" "text", "p_failure_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_revoke_tenant_leaderboard_prompt"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_revoke_tenant_leaderboard_prompt"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_sync_prompt_after_festival_context_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_sync_prompt_after_festival_context_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_sync_prompt_after_tenant_name_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_sync_prompt_after_tenant_name_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_sync_tenant_leaderboard_agent_prompt_context"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_sync_tenant_leaderboard_agent_prompt_context"("p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_tenant_leaderboard_agent_prompt"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_tenant_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_tenant_leaderboard_agent_prompt"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_tenant_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_tenant_leaderboard_agent_prompt_v2"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_tenant_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_tenant_leaderboard_agent_prompt_v2"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_tenant_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_tenant_leaderboard_agent_prompt_v2"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_tenant_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_upsert_mark"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_registration_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_max_mark" numeric, "p_criteria_snapshot" "jsonb", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_upsert_mark"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_registration_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_max_mark" numeric, "p_criteria_snapshot" "jsonb", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_mark"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_registration_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_max_mark" numeric, "p_criteria_snapshot" "jsonb", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_stage_code_letters"("p_schedule_id" "uuid", "p_item_id" "uuid", "p_tenant_id" "uuid", "p_assignments" "jsonb", "p_overwrite" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_stage_code_letters"("p_schedule_id" "uuid", "p_item_id" "uuid", "p_tenant_id" "uuid", "p_assignments" "jsonb", "p_overwrite" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_stage_code_letters"("p_schedule_id" "uuid", "p_item_id" "uuid", "p_tenant_id" "uuid", "p_assignments" "jsonb", "p_overwrite" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_judge_login"("p_token_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_judge_login"("p_token_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_judge_login"("p_token_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_judge_login"("p_token_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."archive_child_organisation"("p_org_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_child_organisation"("p_org_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_child_organisation"("p_org_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_public_result_no"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_public_result_no"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_public_result_no"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_public_result_no_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_public_result_no_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_public_result_no_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_judge_token_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_judge_token_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_judge_token_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_judge_token_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_participant_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_participant_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_participant_changes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_schedule_judge_assignment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_schedule_judge_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_schedule_judge_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_schedule_judge_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_publish_suspense_batch"("p_festival_id" "uuid", "p_tenant_id" "uuid", "p_batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."auto_publish_suspense_batch"("p_festival_id" "uuid", "p_tenant_id" "uuid", "p_batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_publish_suspense_batch"("p_festival_id" "uuid", "p_tenant_id" "uuid", "p_batch_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_set_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_set_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_set_category"() TO "service_role";



GRANT ALL ON FUNCTION "public"."begin_provisioning_operation"("p_operation_type" "text", "p_idempotency_key" "text", "p_parent_id" "uuid", "p_org_name" "text", "p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."begin_provisioning_operation"("p_operation_type" "text", "p_idempotency_key" "text", "p_parent_id" "uuid", "p_org_name" "text", "p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_provisioning_operation"("p_operation_type" "text", "p_idempotency_key" "text", "p_parent_id" "uuid", "p_org_name" "text", "p_username" "text") TO "service_role";



GRANT ALL ON TABLE "public"."schedules" TO "anon";
GRANT ALL ON TABLE "public"."schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."schedules" TO "service_role";



REVOKE ALL ON FUNCTION "public"."bulk_create_schedules"("p_festival_id" "uuid", "p_schedules" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_create_schedules"("p_festival_id" "uuid", "p_schedules" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_create_schedules"("p_festival_id" "uuid", "p_schedules" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_update_page_status"("p_page_keys" "text"[], "p_new_status" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_update_page_status"("p_page_keys" "text"[], "p_new_status" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_update_page_status"("p_page_keys" "text"[], "p_new_status" "text", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_participant_count" integer, "p_is_group" boolean, "p_bracket_override" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_participant_count" integer, "p_is_group" boolean, "p_bracket_override" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_participant_count" integer, "p_is_group" boolean, "p_bracket_override" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_group_size" integer, "p_competing_teams_count" integer, "p_is_group" boolean, "p_bracket_override" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_group_size" integer, "p_competing_teams_count" integer, "p_is_group" boolean, "p_bracket_override" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_group_size" integer, "p_competing_teams_count" integer, "p_is_group" boolean, "p_bracket_override" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_festival_points"("p_festival_id" "uuid", "p_grade" "text", "p_rank" integer, "p_group_size" integer, "p_competing_teams_count" integer, "p_is_group" boolean, "p_bracket_override" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_festival_team_admin"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_festival_team_admin"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_festival_team_admin"("p_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_ghost_code_letters"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_ghost_code_letters"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_ghost_code_letters"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_username_login_attempt"("p_scope" "text", "p_subject_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_username_login_attempt"("p_scope" "text", "p_subject_hash" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_page_snapshot"("p_trigger_action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_page_snapshot"("p_trigger_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_page_snapshot"("p_trigger_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_tenant_admin"("p_org_id" "uuid", "p_admin_email" "text", "p_admin_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_tenant_admin"("p_org_id" "uuid", "p_admin_email" "text", "p_admin_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_tenant_admin"("p_org_id" "uuid", "p_admin_email" "text", "p_admin_password" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_child_organisation"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_child_organisation"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_child_organisation"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_festival_category_safely"("p_category_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_festival_category_safely"("p_category_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_festival_category_safely"("p_category_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_judge_safely"("p_judge_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_judge_safely"("p_judge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_judge_safely"("p_judge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_judge_safely"("p_judge_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."disable_tenant_access"("p_org_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."disable_tenant_access"("p_org_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."disable_tenant_access"("p_org_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enable_tenant_access"("p_org_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enable_tenant_access"("p_org_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enable_tenant_access"("p_org_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_active_judge_assignment_for_marks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_active_judge_assignment_for_marks"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_active_judge_assignment_for_marks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_active_judge_assignment_for_marks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_points_config_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_points_config_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_points_config_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_candidate_profile_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_candidate_profile_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_candidate_profile_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_bulk_unit_assignment"("p_participant_ids" "uuid"[], "p_expected_hashes" "text"[], "p_target_unit_id" "uuid", "p_batch_id" "uuid", "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_bulk_unit_assignment"("p_participant_ids" "uuid"[], "p_expected_hashes" "text"[], "p_target_unit_id" "uuid", "p_batch_id" "uuid", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_bulk_unit_assignment"("p_participant_ids" "uuid"[], "p_expected_hashes" "text"[], "p_target_unit_id" "uuid", "p_batch_id" "uuid", "p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_general_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_general_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_general_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_hs_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_hs_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_hs_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_hss_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_hss_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_hss_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_junior_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_junior_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_junior_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_lp_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_lp_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_lp_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "text", "p_participants" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_schedule_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_schedules" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_schedule_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_schedules" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_schedule_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_schedules" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_senior_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_senior_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_senior_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_upper_primary_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_upper_primary_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_upper_primary_import_chunk"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_session_id" "uuid", "p_participants" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_judge_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_judge_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."expire_judge_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_judge_token"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalise_child_organisation_provisioning"("p_parent_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalise_child_organisation_provisioning"("p_parent_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text", "p_idempotency_key" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."finalise_child_organisation_provisioning"("p_parent_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text", "p_idempotency_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."finalise_team_leader_provisioning"("p_participant_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalise_team_leader_provisioning"("p_participant_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalise_team_leader_provisioning"("p_participant_id" "uuid", "p_user_id" "uuid", "p_email" "text", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalise_tenant_provisioning"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalise_tenant_provisioning"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_idempotency_key" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."finalise_tenant_provisioning"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_idempotency_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."finalise_tenant_provisioning"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_idempotency_key" "text", "p_festival_template" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalise_tenant_provisioning"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_idempotency_key" "text", "p_festival_template" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."finalise_tenant_provisioning"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_idempotency_key" "text", "p_festival_template" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."generate_judge_token"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid", "p_force_refresh" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_judge_token"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid", "p_force_refresh" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_judge_token"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_created_by" "uuid", "p_force_refresh" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_leaderboard"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_leaderboard"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_leaderboard"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_published_results"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_published_results"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_published_results"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_festival_results"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_festival_results"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_festival_results"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_judge_login_status"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_judge_login_status"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_judge_login_status"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_judge_login_status"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_judge_management_status"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_judge_management_status"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_judge_management_status"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_judge_management_status"("p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_judge_registrations"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_judge_registrations"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_judge_registrations"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_judge_registrations"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_judge_registrations"("p_schedule_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_judge_registrations"("p_schedule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_judge_registrations"("p_schedule_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_judge_submission_summary"("p_schedule_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_judge_submission_summary"("p_schedule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_judge_submission_summary"("p_schedule_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_leaderboard_preview"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_ranking_mode" "text", "p_item_limit" integer, "p_use_public_only" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_leaderboard_preview"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_ranking_mode" "text", "p_item_limit" integer, "p_use_public_only" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_leaderboard_preview"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_ranking_mode" "text", "p_item_limit" integer, "p_use_public_only" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_access_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_access_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_access_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_login_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_login_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_login_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_tenant_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_next_festival_chest_number"("p_festival_id" "uuid", "p_category_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_next_festival_chest_number"("p_festival_id" "uuid", "p_category_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_festival_chest_number"("p_festival_id" "uuid", "p_category_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_page_health_check"("p_page_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_page_health_check"("p_page_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_page_health_check"("p_page_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_candidate_profile"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_candidate_profile"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_candidate_profile"("p_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_leaderboard"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_leaderboard"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_leaderboard"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_leaderboard_scoped"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_leaderboard_scoped"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_leaderboard_scoped"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_leaderboard_settings"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_leaderboard_settings"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_leaderboard_settings"("p_tenant_id" "uuid", "p_festival_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_published_results"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_include_participant_details" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_published_results"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_include_participant_details" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_published_results"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_include_participant_details" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_published_results_scoped"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_include_participant_details" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_published_results_scoped"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_include_participant_details" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_published_results_scoped"("p_tenant_id" "uuid", "p_festival_id" "uuid", "p_include_participant_details" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_terminology"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_terminology"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_terminology"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_unit_profile"("p_unit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_unit_profile"("p_unit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_unit_profile"("p_unit_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_verification_status"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_verification_status"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_verification_status"("p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_schedule_readiness"("p_schedule_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_schedule_readiness"("p_schedule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_schedule_readiness"("p_schedule_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_schedule_registrations"("p_schedule_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_schedule_registrations"("p_schedule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_schedule_registrations"("p_schedule_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_stage_management_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stage_management_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stage_management_context"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_stage_management_registrations"("p_schedule_id" "uuid", "p_festival_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stage_management_registrations"("p_schedule_id" "uuid", "p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stage_management_registrations"("p_schedule_id" "uuid", "p_festival_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_stage_management_registrations_scoped"("p_schedule_id" "uuid", "p_festival_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stage_management_registrations_scoped"("p_schedule_id" "uuid", "p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stage_management_registrations_scoped"("p_schedule_id" "uuid", "p_festival_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_stage_management_schedules"("p_festival_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stage_management_schedules"("p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stage_management_schedules"("p_festival_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_stage_management_venues"("p_festival_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stage_management_venues"("p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stage_management_venues"("p_festival_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_strategic_publish_order"("p_festival_id" "uuid", "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_strategic_publish_order"("p_festival_id" "uuid", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_strategic_publish_order"("p_festival_id" "uuid", "p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_team_leader_announcements"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_leader_announcements"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_team_leader_announcements"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_team_leader_assignments_for_admin"("p_festival_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_leader_assignments_for_admin"("p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_leader_assignments_for_admin"("p_festival_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_team_leader_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_leader_context"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_team_leader_context"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_team_leader_context_details"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_leader_context_details"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_leader_context_details"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_team_leader_participant_account"("p_participant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_leader_participant_account"("p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_leader_participant_account"("p_participant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_team_leader_participants"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_leader_participants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_leader_participants"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_team_leader_published_results"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_leader_published_results"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_team_leader_published_results"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_team_leader_schedule"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_leader_schedule"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_team_leader_schedule"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_team_leader_standings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_leader_standings"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_team_leader_standings"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_tenant_leaderboard_agent_prompt"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tenant_leaderboard_agent_prompt"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_leaderboard_agent_prompt"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenant_terminology"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_terminology"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_terminology"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_visible_organisations"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_visible_organisations"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_visible_organisations"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_visible"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_visible"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_visible"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_team_leader"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_team_leader"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_team_leader"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb", "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb", "p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb", "p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb", "p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb", "p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_judge_activity"("p_judge_id" "uuid", "p_schedule_id" "uuid", "p_tenant_id" "uuid", "p_action_type" "text", "p_action_details" "jsonb", "p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lookup_email_by_username"("p_username" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lookup_email_by_username"("p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_schedule_venue_overlap"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_schedule_venue_overlap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_schedule_venue_overlap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."preview_bulk_unit_assignment"("p_participant_ids" "uuid"[], "p_target_unit_id" "uuid", "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."preview_bulk_unit_assignment"("p_participant_ids" "uuid"[], "p_target_unit_id" "uuid", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."preview_bulk_unit_assignment"("p_participant_ids" "uuid"[], "p_target_unit_id" "uuid", "p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_provisioning_event"("p_operation_type" "text", "p_idempotency_key" "text", "p_status" "text", "p_requested_by" "uuid", "p_target_organisation_id" "uuid", "p_target_tenant_id" "uuid", "p_target_user_id" "uuid", "p_admin_email" "text", "p_failure_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_provisioning_event"("p_operation_type" "text", "p_idempotency_key" "text", "p_status" "text", "p_requested_by" "uuid", "p_target_organisation_id" "uuid", "p_target_tenant_id" "uuid", "p_target_user_id" "uuid", "p_admin_email" "text", "p_failure_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."regenerate_festival_chest_numbers"("p_festival_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerate_festival_chest_numbers"("p_festival_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regenerate_festival_chest_numbers"("p_festival_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."regenerate_festival_chest_numbers_internal"("p_festival_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerate_festival_chest_numbers_internal"("p_festival_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_festival_template_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_festival_template_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_judge_login"("p_token_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_judge_login"("p_token_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_judge_login"("p_token_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_judge_login"("p_token_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_schedule_judge"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_force" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_schedule_judge"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_force" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."remove_schedule_judge"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_force" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_schedule_judge"("p_schedule_id" "uuid", "p_judge_id" "uuid", "p_force" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_judge_login"("p_token" "text", "p_device_id" "text", "p_device_info" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_judge_login"("p_token" "text", "p_device_id" "text", "p_device_info" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_judge_login"("p_token" "text", "p_device_id" "text", "p_device_info" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_judge_login"("p_token" "text", "p_device_id" "text", "p_device_info" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_schedule_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_schedule_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_schedule_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_category"("p_class_std" integer, "p_dob" "date", "p_education_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_category"("p_class_std" integer, "p_dob" "date", "p_education_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_category"("p_class_std" integer, "p_dob" "date", "p_education_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_festival_template"("p_festival_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_festival_template"("p_festival_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_item_categories"("p_item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_item_categories"("p_item_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_login_email"("p_username" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_login_email"("p_username" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_participant_category"("p_participant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_participant_category"("p_participant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_reset_target"("p_actor_id" "uuid", "p_target_type" "text", "p_organisation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_reset_target"("p_actor_id" "uuid", "p_target_type" "text", "p_organisation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_child_organisation"("p_org_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_child_organisation"("p_org_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_child_organisation"("p_org_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_page_snapshot"("p_snapshot_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_page_snapshot"("p_snapshot_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_page_snapshot"("p_snapshot_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_tenant_access"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_tenant_access"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_tenant_access"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_termination"("p_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_termination"("p_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_termination"("p_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rollback_unit_assignment"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rollback_unit_assignment"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rollback_unit_assignment"("p_batch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."safe_delete_schedule"("p_schedule_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."safe_delete_schedule"("p_schedule_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_delete_schedule"("p_schedule_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."safe_delete_venue"("p_venue_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."safe_delete_venue"("p_venue_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_delete_venue"("p_venue_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."safe_unassign_registration"("p_registration_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."safe_unassign_registration"("p_registration_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_unassign_registration"("p_registration_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_auth_uid"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_auth_uid"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_auth_uid"("uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_schedule_judges"("p_schedule_id" "uuid", "p_judge_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_schedule_judges"("p_schedule_id" "uuid", "p_judge_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."set_schedule_judges"("p_schedule_id" "uuid", "p_judge_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_schedule_judges"("p_schedule_id" "uuid", "p_judge_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."setup_child_organisation"("p_parent_id" "uuid", "p_new_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."setup_child_organisation"("p_parent_id" "uuid", "p_new_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."setup_child_organisation"("p_parent_id" "uuid", "p_new_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text", "p_internal_email" "text", "p_password_temp" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."setup_child_organisation"("p_parent_id" "uuid", "p_new_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text", "p_internal_email" "text", "p_password_temp" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."setup_child_organisation"("p_parent_id" "uuid", "p_new_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_username" "text", "p_internal_email" "text", "p_password_temp" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."setup_tenant_records"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."setup_tenant_records"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."setup_tenant_records"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_admin_email" "text", "p_admin_pass" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."setup_tenant_records"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_admin_email" "text", "p_admin_pass" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."setup_tenant_records"("p_org_id" "uuid", "p_user_id" "uuid", "p_org_name" "text", "p_org_type" "text", "p_admin_email" "text", "p_admin_pass" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."slugify_candidate_name"("value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slugify_candidate_name"("value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slugify_candidate_name"("value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."snapshot_festival_template_from_tenant"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."snapshot_festival_template_from_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."snapshot_points_config_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_points_config_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_points_config_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ssf_calculate_age"("p_dob" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."ssf_calculate_age"("p_dob" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ssf_calculate_age"("p_dob" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."ssf_calculate_age"("p_dob" "date", "p_festival_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."ssf_calculate_age"("p_dob" "date", "p_festival_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ssf_calculate_age"("p_dob" "date", "p_festival_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."ssf_get_category"("p_dob" "date", "p_class_std" integer, "p_education_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ssf_get_category"("p_dob" "date", "p_class_std" integer, "p_education_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ssf_get_category"("p_dob" "date", "p_class_std" integer, "p_education_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ssf_get_category"("p_dob" "date", "p_class_std" integer, "p_education_type" "text", "p_festival_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."ssf_get_category"("p_dob" "date", "p_class_std" integer, "p_education_type" "text", "p_festival_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ssf_get_category"("p_dob" "date", "p_class_std" integer, "p_education_type" "text", "p_festival_year" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage_assert_admin_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage_assert_admin_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."stage_portal_apply_code_letters"("p_token" "text", "p_schedule_id" "uuid", "p_item_id" "uuid", "p_assignments" "jsonb", "p_overwrite" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."stage_portal_apply_code_letters"("p_token" "text", "p_schedule_id" "uuid", "p_item_id" "uuid", "p_assignments" "jsonb", "p_overwrite" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_portal_apply_code_letters"("p_token" "text", "p_schedule_id" "uuid", "p_item_id" "uuid", "p_assignments" "jsonb", "p_overwrite" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."stage_portal_get_registrations"("p_token" "text", "p_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."stage_portal_get_registrations"("p_token" "text", "p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_portal_get_registrations"("p_token" "text", "p_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."stage_portal_update_registration"("p_token" "text", "p_reg_id" "uuid", "p_is_verified" boolean, "p_code_letter" "text", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."stage_portal_update_registration"("p_token" "text", "p_reg_id" "uuid", "p_is_verified" boolean, "p_code_letter" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_portal_update_registration"("p_token" "text", "p_reg_id" "uuid", "p_is_verified" boolean, "p_code_letter" "text", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage_update_code_letter"("p_schedule_id" "uuid", "p_registration_id" "uuid", "p_code_letter" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage_update_code_letter"("p_schedule_id" "uuid", "p_registration_id" "uuid", "p_code_letter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_update_code_letter"("p_schedule_id" "uuid", "p_registration_id" "uuid", "p_code_letter" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage_update_registration"("p_schedule_id" "uuid", "p_registration_id" "uuid", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage_update_registration"("p_schedule_id" "uuid", "p_registration_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_update_registration"("p_schedule_id" "uuid", "p_registration_id" "uuid", "p_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."stage_update_schedule_lock"("p_schedule_id" "uuid", "p_locked" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stage_update_schedule_lock"("p_schedule_id" "uuid", "p_locked" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_update_schedule_lock"("p_schedule_id" "uuid", "p_locked" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."stage_verify_token"("p_token" "text", OUT "out_tenant_id" "uuid", OUT "out_venue_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."stage_verify_token"("p_token" "text", OUT "out_tenant_id" "uuid", OUT "out_venue_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stage_verify_token"("p_token" "text", OUT "out_tenant_id" "uuid", OUT "out_venue_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_schedule_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_is_final" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_schedule_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_is_final" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_schedule_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_is_final" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_festival_year_from_start_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_festival_year_from_start_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_festival_year_from_start_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_page_registry"("p_manifest" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_page_registry"("p_manifest" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_page_registry"("p_manifest" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profile_to_jwt"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_to_jwt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_to_jwt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."terminate_participant"("p_participant_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."terminate_participant"("p_participant_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."terminate_participant"("p_participant_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_announcer_result_visibility"("p_token" "text", "p_item_id" "uuid", "p_is_public" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_announcer_result_visibility"("p_token" "text", "p_item_id" "uuid", "p_is_public" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_announcer_result_visibility"("p_token" "text", "p_item_id" "uuid", "p_is_public" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_participant_team"("p_participant_id" "uuid", "p_new_org_id" "uuid", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_participant_team"("p_participant_id" "uuid", "p_new_org_id" "uuid", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_participant_team"("p_participant_id" "uuid", "p_new_org_id" "uuid", "p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."unlock_schedule_marks"("p_schedule_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unlock_schedule_marks"("p_schedule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unlock_schedule_marks"("p_schedule_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_page_status"("p_page_key" "text", "p_new_status" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_page_status"("p_page_key" "text", "p_new_status" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_page_status"("p_page_key" "text", "p_new_status" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_status" "text", "p_entry_mode" "text", "p_max_mark" numeric, "p_criteria_snapshot" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_status" "text", "p_entry_mode" "text", "p_max_mark" numeric, "p_criteria_snapshot" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_status" "text", "p_entry_mode" "text", "p_max_mark" numeric, "p_criteria_snapshot" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_judge_mark"("p_token" "text", "p_registration_id" "uuid", "p_criteria_scores" "jsonb", "p_total_mark" numeric, "p_status" "text", "p_entry_mode" "text", "p_max_mark" numeric, "p_criteria_snapshot" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_tenant_terminology"("p_tenant_id" "uuid", "p_org_level_1_label" "text", "p_org_level_2_label" "text", "p_org_level_3_label" "text", "p_org_level_4_label" "text", "p_org_level_5_label" "text", "p_festival_name" "text", "p_organization_name" "text", "p_participant_label" "text", "p_registration_label" "text", "p_result_label" "text", "p_schedule_label" "text", "p_venue_label" "text", "p_judge_label" "text", "p_score_label" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_tenant_terminology"("p_tenant_id" "uuid", "p_org_level_1_label" "text", "p_org_level_2_label" "text", "p_org_level_3_label" "text", "p_org_level_4_label" "text", "p_org_level_5_label" "text", "p_festival_name" "text", "p_organization_name" "text", "p_participant_label" "text", "p_registration_label" "text", "p_result_label" "text", "p_schedule_label" "text", "p_venue_label" "text", "p_judge_label" "text", "p_score_label" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_tenant_terminology"("p_tenant_id" "uuid", "p_org_level_1_label" "text", "p_org_level_2_label" "text", "p_org_level_3_label" "text", "p_org_level_4_label" "text", "p_org_level_5_label" "text", "p_festival_name" "text", "p_organization_name" "text", "p_participant_label" "text", "p_registration_label" "text", "p_result_label" "text", "p_schedule_label" "text", "p_venue_label" "text", "p_judge_label" "text", "p_score_label" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_festival_category_row"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_festival_category_row"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_festival_team_mapping"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_festival_team_mapping"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_item_categories_for_template"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_item_categories_for_template"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_judge_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_judge_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_judge_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_judge_token"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_mark_entry_scoring"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_mark_entry_scoring"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_mark_entry_scoring"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_participant_category"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_participant_category"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_registration_category_compatibility"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_registration_category_compatibility"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_result_points_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_result_points_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_result_points_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_stage_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_stage_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_stage_token"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_team_leader_assignment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_team_leader_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_tenant_access"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_tenant_access"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_tenant_access"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."announcer_tokens" TO "anon";
GRANT ALL ON TABLE "public"."announcer_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."announcer_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."certificates" TO "anon";
GRANT ALL ON TABLE "public"."certificates" TO "authenticated";
GRANT ALL ON TABLE "public"."certificates" TO "service_role";



GRANT ALL ON TABLE "public"."chest_number_regeneration_audits" TO "anon";
GRANT ALL ON TABLE "public"."chest_number_regeneration_audits" TO "authenticated";
GRANT ALL ON TABLE "public"."chest_number_regeneration_audits" TO "service_role";



GRANT ALL ON TABLE "public"."export_jobs" TO "anon";
GRANT ALL ON TABLE "public"."export_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."export_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."festival_calendar" TO "anon";
GRANT ALL ON TABLE "public"."festival_calendar" TO "authenticated";
GRANT ALL ON TABLE "public"."festival_calendar" TO "service_role";



GRANT ALL ON TABLE "public"."festival_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."festival_categories" TO "service_role";



GRANT ALL ON TABLE "public"."festival_leaderboard_settings" TO "anon";
GRANT ALL ON TABLE "public"."festival_leaderboard_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."festival_leaderboard_settings" TO "service_role";



GRANT ALL ON TABLE "public"."festival_teams" TO "anon";
GRANT ALL ON TABLE "public"."festival_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."festival_teams" TO "service_role";



GRANT ALL ON TABLE "public"."file_metadata" TO "anon";
GRANT ALL ON TABLE "public"."file_metadata" TO "authenticated";
GRANT ALL ON TABLE "public"."file_metadata" TO "service_role";



GRANT ALL ON TABLE "public"."generated_assets" TO "anon";
GRANT ALL ON TABLE "public"."generated_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_assets" TO "service_role";



GRANT ALL ON TABLE "public"."generated_posters" TO "anon";
GRANT ALL ON TABLE "public"."generated_posters" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_posters" TO "service_role";



GRANT ALL ON TABLE "public"."grace_marks" TO "anon";
GRANT ALL ON TABLE "public"."grace_marks" TO "authenticated";
GRANT ALL ON TABLE "public"."grace_marks" TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";



GRANT ALL ON TABLE "public"."import_sessions" TO "anon";
GRANT ALL ON TABLE "public"."import_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."import_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."items" TO "anon";
GRANT ALL ON TABLE "public"."items" TO "authenticated";
GRANT ALL ON TABLE "public"."items" TO "service_role";



GRANT ALL ON TABLE "public"."judge_activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."judge_activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."judge_activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."judge_session_status" TO "anon";
GRANT ALL ON TABLE "public"."judge_session_status" TO "authenticated";
GRANT ALL ON TABLE "public"."judge_session_status" TO "service_role";



GRANT ALL ON TABLE "public"."judges" TO "anon";
GRANT ALL ON TABLE "public"."judges" TO "authenticated";
GRANT ALL ON TABLE "public"."judges" TO "service_role";



GRANT ALL ON TABLE "public"."mark_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."mark_entries" TO "service_role";



GRANT ALL ON TABLE "public"."judge_submission_status" TO "anon";
GRANT ALL ON TABLE "public"."judge_submission_status" TO "authenticated";
GRANT ALL ON TABLE "public"."judge_submission_status" TO "service_role";



GRANT ALL ON TABLE "public"."judge_tokens" TO "anon";
GRANT ALL ON TABLE "public"."judge_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."judge_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."notification_logs" TO "anon";
GRANT ALL ON TABLE "public"."notification_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_logs" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."organisations" TO "anon";
GRANT ALL ON TABLE "public"."organisations" TO "authenticated";
GRANT ALL ON TABLE "public"."organisations" TO "service_role";



GRANT ALL ON TABLE "public"."page_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."page_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."page_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."page_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."page_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."page_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."participant_unit_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."participant_unit_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_unit_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."participant_unit_batches" TO "anon";
GRANT ALL ON TABLE "public"."participant_unit_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_unit_batches" TO "service_role";



GRANT ALL ON TABLE "public"."participants" TO "anon";
GRANT ALL ON TABLE "public"."participants" TO "authenticated";
GRANT ALL ON TABLE "public"."participants" TO "service_role";



GRANT ALL ON TABLE "public"."point_table" TO "anon";
GRANT ALL ON TABLE "public"."point_table" TO "authenticated";
GRANT ALL ON TABLE "public"."point_table" TO "service_role";



GRANT ALL ON TABLE "public"."points_config" TO "anon";
GRANT ALL ON TABLE "public"."points_config" TO "authenticated";
GRANT ALL ON TABLE "public"."points_config" TO "service_role";



GRANT ALL ON TABLE "public"."points_config_versions" TO "anon";
GRANT ALL ON TABLE "public"."points_config_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."points_config_versions" TO "service_role";



GRANT ALL ON TABLE "public"."poster_approval_requests" TO "anon";
GRANT ALL ON TABLE "public"."poster_approval_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."poster_approval_requests" TO "service_role";



GRANT ALL ON TABLE "public"."poster_drafts" TO "anon";
GRANT ALL ON TABLE "public"."poster_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."poster_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."poster_templates" TO "anon";
GRANT ALL ON TABLE "public"."poster_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."poster_templates" TO "service_role";



GRANT ALL ON TABLE "public"."poster_versions" TO "anon";
GRANT ALL ON TABLE "public"."poster_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."poster_versions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."registrations" TO "anon";
GRANT ALL ON TABLE "public"."registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."registrations" TO "service_role";



GRANT ALL ON TABLE "public"."results" TO "anon";
GRANT ALL ON TABLE "public"."results" TO "authenticated";
GRANT ALL ON TABLE "public"."results" TO "service_role";



GRANT ALL ON SEQUENCE "public"."results_public_result_no_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."results_public_result_no_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."results_public_result_no_seq" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_judge_assignments" TO "anon";
GRANT ALL ON TABLE "public"."schedule_judge_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_judge_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."scoring_criteria" TO "anon";
GRANT ALL ON TABLE "public"."scoring_criteria" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_criteria" TO "service_role";



GRANT ALL ON TABLE "public"."scoring_rules" TO "anon";
GRANT ALL ON TABLE "public"."scoring_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_rules" TO "service_role";



GRANT ALL ON TABLE "public"."stage_tokens" TO "anon";
GRANT ALL ON TABLE "public"."stage_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."stage_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."system_api_keys" TO "anon";
GRANT ALL ON TABLE "public"."system_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."system_api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."system_events" TO "anon";
GRANT ALL ON TABLE "public"."system_events" TO "authenticated";
GRANT ALL ON TABLE "public"."system_events" TO "service_role";



GRANT ALL ON TABLE "public"."system_pages" TO "anon";
GRANT ALL ON TABLE "public"."system_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."system_pages" TO "service_role";



GRANT ALL ON TABLE "public"."team_leader_assignments" TO "anon";
GRANT ALL ON TABLE "public"."team_leader_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."team_leader_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."team_portal_settings" TO "anon";
GRANT ALL ON TABLE "public"."team_portal_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."team_portal_settings" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_access_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."tenant_access_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_access_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_agent_prompts" TO "anon";
GRANT ALL ON TABLE "public"."tenant_agent_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_agent_prompts" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_provisioning_operations" TO "anon";
GRANT ALL ON TABLE "public"."tenant_provisioning_operations" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_provisioning_operations" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_terminology" TO "anon";
GRANT ALL ON TABLE "public"."tenant_terminology" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_terminology" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."transfer_logs" TO "anon";
GRANT ALL ON TABLE "public"."transfer_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."transfer_logs" TO "service_role";



GRANT ALL ON TABLE "public"."user_notification_tokens" TO "anon";
GRANT ALL ON TABLE "public"."user_notification_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notification_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."username_login_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."venues" TO "anon";
GRANT ALL ON TABLE "public"."venues" TO "authenticated";
GRANT ALL ON TABLE "public"."venues" TO "service_role";



GRANT ALL ON TABLE "public"."vw_public_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."vw_public_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_public_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."vw_public_live_status" TO "anon";
GRANT ALL ON TABLE "public"."vw_public_live_status" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_public_live_status" TO "service_role";



GRANT ALL ON TABLE "public"."vw_public_participants" TO "anon";
GRANT ALL ON TABLE "public"."vw_public_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_public_participants" TO "service_role";



GRANT ALL ON TABLE "public"."vw_public_results" TO "anon";
GRANT ALL ON TABLE "public"."vw_public_results" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_public_results" TO "service_role";



GRANT ALL ON TABLE "public"."vw_public_schedule" TO "anon";
GRANT ALL ON TABLE "public"."vw_public_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_public_schedule" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







