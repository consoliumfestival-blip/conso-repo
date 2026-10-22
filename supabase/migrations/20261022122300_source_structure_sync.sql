-- TARGET ONLY: negkevoetuvuqqlecdno
-- Source catalog observed: 2026-10-22T12:22:33.779Z
-- Source Supabase was queried only through the read-only catalog endpoint.
-- No source rows, Auth users, Storage objects or points configuration records imported.
-- source_catalog_sha256=0df08fe41aebe6770892340b3f08a479bac38ae22ceda50ee65f2b10b1351a42
-- target_catalog_sha256=c24dccc2369abd764288e962681a18a1a5c8d05aea0228f1da04f391d19be338
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL check_function_bodies = false;

-- Application helper schemas
CREATE SCHEMA "code_letter_private" AUTHORIZATION "postgres";

CREATE SCHEMA "group_entry_private" AUTHORIZATION "postgres";

CREATE SCHEMA "scoring_private" AUTHORIZATION "postgres";

CREATE SCHEMA "stage_portal_private" AUTHORIZATION "postgres";

-- Create missing tables without business rows
CREATE TABLE "group_entry_private"."member_edit_authorizations" (
  "transaction_id" bigint NOT NULL,
  "registration_id" uuid NOT NULL,
  "actor_id" uuid NOT NULL
);
ALTER TABLE "group_entry_private"."member_edit_authorizations" OWNER TO "postgres";

CREATE TABLE "public"."festival_chest_number_controls" (
  "festival_id" uuid NOT NULL,
  "locked" boolean DEFAULT false NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."festival_chest_number_controls" OWNER TO "postgres";

CREATE TABLE "public"."festival_team_chest_slots" (
  "festival_id" uuid NOT NULL,
  "organisation_id" uuid NOT NULL,
  "slot_number" integer NOT NULL
);
ALTER TABLE "public"."festival_team_chest_slots" OWNER TO "postgres";

CREATE TABLE "public"."general_entry_number_counters" (
  "tenant_id" uuid NOT NULL,
  "festival_id" uuid NOT NULL,
  "next_number" bigint DEFAULT 1 NOT NULL,
  "numeric_next_number" bigint
);
ALTER TABLE "public"."general_entry_number_counters" OWNER TO "postgres";

CREATE TABLE "public"."grace_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "festival_id" uuid NOT NULL,
  "config_version" integer NOT NULL,
  "revision" integer NOT NULL,
  "entries" jsonb NOT NULL,
  "fields_snapshot" jsonb NOT NULL,
  "teams_snapshot" jsonb NOT NULL,
  "previous_totals" jsonb NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."grace_submissions" OWNER TO "postgres";

CREATE TABLE "public"."grace_workspaces" (
  "festival_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "config_version" integer NOT NULL,
  "revision" integer NOT NULL,
  "entries" jsonb NOT NULL,
  "updated_by" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."grace_workspaces" OWNER TO "postgres";

CREATE TABLE "public"."participant_chest_number_changes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "festival_id" uuid NOT NULL,
  "participant_id" uuid NOT NULL,
  "old_chest_number" text,
  "new_chest_number" text,
  "old_organisation_id" uuid,
  "new_organisation_id" uuid,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."participant_chest_number_changes" OWNER TO "postgres";

CREATE TABLE "public"."program_intake_statuses" (
  "tenant_id" uuid NOT NULL,
  "festival_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "category_code" text NOT NULL,
  "entry_kind" text NOT NULL,
  "is_complete" boolean DEFAULT false NOT NULL,
  "completed_at" timestamp with time zone,
  "completed_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."program_intake_statuses" OWNER TO "postgres";

CREATE TABLE "public"."scoring_publications" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "festival_id" uuid NOT NULL,
  "schedule_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "config_version" integer NOT NULL,
  "input_hash" text NOT NULL,
  "results_payload" jsonb NOT NULL,
  "previous_results" jsonb NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."scoring_publications" OWNER TO "postgres";

CREATE TABLE "stage_portal_private"."pin_attempts" (
  "venue_id" uuid NOT NULL,
  "attempt_key" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_until" timestamp with time zone
);
ALTER TABLE "stage_portal_private"."pin_attempts" OWNER TO "postgres";

CREATE TABLE "stage_portal_private"."venue_access_codes" (
  "venue_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "festival_id" uuid NOT NULL,
  "pin" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "stage_portal_private"."venue_access_codes" OWNER TO "postgres";

-- Add fields and align structural defaults and nullability
ALTER TABLE "public"."chest_number_regeneration_audits" ADD COLUMN "chest_number_template" text DEFAULT 'category'::text NOT NULL;

ALTER TABLE "public"."festival_calendar" ADD COLUMN "gender_mode" text DEFAULT 'both'::text NOT NULL;

ALTER TABLE "public"."festival_calendar" ADD COLUMN "chest_number_template" text DEFAULT 'category'::text NOT NULL;

ALTER TABLE "public"."grace_marks" ALTER COLUMN "points" DROP DEFAULT;

ALTER TABLE "public"."grace_marks" ADD COLUMN "submission_id" uuid;

ALTER TABLE "public"."group_members" ADD COLUMN "member_order" integer;

ALTER TABLE "public"."items" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();

ALTER TABLE "public"."mark_entries" ALTER COLUMN "max_mark_snapshot" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "rank_1_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "rank_2_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "rank_3_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "grade_a_plus_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "grade_a_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "grade_b_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "grade_c_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "participation_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "ind_a_plus_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "ind_a_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "ind_b_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "ind_c_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "grp_a_plus_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "grp_a_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "grp_b_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "grp_c_points" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "grade_thresholds" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "point_brackets" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "group_point_brackets" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "rule12_min_teams" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "rule12_min_teams" DROP NOT NULL;

ALTER TABLE "public"."points_config" ALTER COLUMN "rule12_behavior" DROP DEFAULT;

ALTER TABLE "public"."points_config" ALTER COLUMN "rule12_behavior" DROP NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "grade_boost_points" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "group_grade_boost_points" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "rank_boost_points" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "grade_boost_item_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "rank_boost_item_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "grace_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "grade_boost_enabled" boolean DEFAULT true NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "rank_boost_enabled" boolean DEFAULT true NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "member_brackets_enabled" boolean DEFAULT true NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "grade_boost_sections" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "public"."points_config" ADD COLUMN "rank_boost_sections" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "public"."registrations" ADD COLUMN "entry_kind" text DEFAULT 'participant'::text NOT NULL;

ALTER TABLE "public"."registrations" ADD COLUMN "entry_chest_number" text;

ALTER TABLE "public"."registrations" ADD COLUMN "code_letter_fixed" boolean DEFAULT false NOT NULL;

ALTER TABLE "public"."registrations" ADD COLUMN "group_leader_participant_id" uuid;

ALTER TABLE "public"."scoring_rules" ALTER COLUMN "total_marks" DROP DEFAULT;

-- Current source function definitions, not function execution
CREATE OR REPLACE FUNCTION public.audit_participant_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.audit_logs (table_name, record_id, action, old_value, new_value)
  VALUES (
    'participants',
    NEW.id,
    TG_OP,
    pg_catalog.row_to_json(OLD),
    pg_catalog.row_to_json(NEW)
  );
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."audit_participant_changes"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_public_candidate_profile(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
          'entry_kind', reg.entry_kind,
          'entry_chest_number', group_entry_private.chest_number(reg),
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
      WHERE (reg.participant_id = v_participant.id OR (
          reg.entry_kind='general_team' AND reg.participant_id IS NULL
          AND EXISTS(SELECT 1 FROM public.group_members gm
            JOIN public.participants member ON member.id=gm.participant_id
            WHERE gm.registration_id=reg.id AND gm.participant_id=v_participant.id
              AND member.festival_id=reg.festival_id)))
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
$function$;
ALTER FUNCTION "public"."get_public_candidate_profile"(p_slug text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public._legacy_execute_junior_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
ALTER FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public._legacy_execute_senior_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
ALTER FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public._legacy_execute_upper_primary_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
ALTER FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public._legacy_execute_lp_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
ALTER FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public._legacy_execute_hs_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
ALTER FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public._legacy_execute_hss_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
ALTER FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public._legacy_execute_general_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
ALTER FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.validate_mark_entry_scoring()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    IF NEW.max_mark_snapshot IS NULL OR NEW.max_mark_snapshot <= 0 OR NEW.total_mark < 0 OR NEW.total_mark > NEW.max_mark_snapshot THEN RAISE EXCEPTION 'Marks must be within an explicit positive maximum.'; END IF;

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
$function$;
ALTER FUNCTION "public"."validate_mark_entry_scoring"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.snapshot_points_config_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN
  IF TG_OP='INSERT' OR NEW.config_version IS DISTINCT FROM OLD.config_version THEN
    INSERT INTO public.points_config_versions(tenant_id,festival_id,config_version,config_snapshot,change_reason,created_by)
      VALUES(NEW.tenant_id,NEW.festival_id,NEW.config_version,to_jsonb(NEW),NEW.change_reason,auth.uid());
  END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION "public"."snapshot_points_config_version"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.validate_result_points_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE sealed jsonb; k text; BEGIN
  -- Visibility/reopen/archive operations keep historical scoring inputs unchanged.
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['published','published_at','published_by','result_status','public_visible','updated_at','updated_by'])
      IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['published','published_at','published_by','result_status','public_visible','updated_at','updated_by'])
      AND (OLD.published IS TRUE OR NEW.published IS NOT TRUE) THEN RETURN NEW; END IF;
  IF NEW.published IS NOT TRUE AND NEW.points_calculation IS NULL AND NEW.points_awarded IS NULL THEN RETURN NEW; END IF;
  PERFORM scoring_private.assert_admin(NEW.tenant_id);
  SELECT p.results_payload->NEW.registration_id::text INTO sealed FROM public.scoring_publications p
    WHERE p.id=(NEW.points_calculation->>'publication_id')::uuid AND p.tenant_id=NEW.tenant_id
      AND p.festival_id=NEW.festival_id AND p.item_id=NEW.item_id AND p.schedule_id=NEW.schedule_id AND p.config_version=NEW.points_config_version;
  IF sealed IS NULL THEN RAISE EXCEPTION 'Publish scoring through the authoritative competition publication API.'; END IF;
  FOREACH k IN ARRAY ARRAY['tenant_id','festival_id','schedule_id','item_id','registration_id','total_score','rank','grade','points_awarded','grade_only','points_config_version','points_calculation','collection_method'] LOOP
    IF sealed->k IS DISTINCT FROM to_jsonb(NEW)->k THEN RAISE EXCEPTION 'Result does not match its verified publication snapshot: %',k; END IF;
  END LOOP;
  RETURN NEW;
END $function$;
ALTER FUNCTION "public"."validate_result_points_snapshot"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.calculate_festival_points(p_festival_id uuid, p_grade text, p_rank integer, p_participant_count integer, p_is_group boolean DEFAULT false, p_bracket_override text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT public.calculate_festival_points(p_festival_id,p_grade,p_rank,p_participant_count,p_participant_count,p_is_group,p_bracket_override);
$function$;
ALTER FUNCTION "public"."calculate_festival_points"(p_festival_id uuid, p_grade text, p_rank integer, p_participant_count integer, p_is_group boolean, p_bracket_override text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_judge_registrations(p_token text)
 RETURNS TABLE(id uuid, item_id uuid, tenant_id uuid, code_letter text, participant_name text, chest_number text, photo_url text, category_code text, is_verified boolean, existing_mark jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
    registration.code_letter, CASE WHEN registration.entry_kind='general_team' THEN group_entry_private.display_name(registration) ELSE participant.name END, CASE WHEN registration.entry_kind='general_team' THEN group_entry_private.chest_number(registration) ELSE participant.chest_number END,
    participant.photo_url, CASE WHEN registration.entry_kind='general_team' THEN group_entry_private.category_code(registration) ELSE participant.category_code END, registration.is_verified,
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
$function$;
ALTER FUNCTION "public"."get_judge_registrations"(p_token text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.upsert_judge_mark(p_token text, p_registration_id uuid, p_criteria_scores jsonb DEFAULT '{}'::jsonb, p_total_mark numeric DEFAULT NULL::numeric, p_status text DEFAULT 'draft'::text, p_entry_mode text DEFAULT 'criteria'::text, p_max_mark numeric DEFAULT NULL::numeric, p_criteria_snapshot jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
      p_max_mark,
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
$function$;
ALTER FUNCTION "public"."upsert_judge_mark"(p_token text, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_status text, p_entry_mode text, p_max_mark numeric, p_criteria_snapshot jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public._assert_organisation_hierarchy_access(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_archived_target_under_visible_parent boolean := false;
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

  IF public.get_my_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'Permission denied: tenant access required';
  END IF;

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

  SELECT EXISTS (
    SELECT 1
    FROM public.organisations target_org
    WHERE target_org.id = p_org_id
      AND target_org.archived_at IS NOT NULL
      AND target_org.parent_id IS NOT NULL
      AND public.is_org_visible(target_org.parent_id)
  ) INTO v_archived_target_under_visible_parent;

  IF NOT (
    (public.is_org_visible(p_org_id) OR v_archived_target_under_visible_parent)
    AND p_org_id <> public.get_my_org_id()
  ) THEN
    RAISE EXCEPTION 'Permission denied: target organisation is not within your hierarchy';
  END IF;
END;
$function$;
ALTER FUNCTION "public"."_assert_organisation_hierarchy_access"(p_org_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_team_leader_schedule()
 RETURNS TABLE(schedule_id uuid, item_id uuid, item_code text, item_name text, category_codes text[], venue_name text, start_time timestamp with time zone, end_time timestamp with time zone, event_status text, participant_count bigint, checked_in_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
 SELECT s.id,s.item_id,i.item_code,COALESCE(i.item_name_en,i.item_name_ml),i.category_codes,v.name,s.start_time,s.end_time,s.status,COUNT(DISTINCT COALESCE(p.id,gp.id)),COUNT(DISTINCT r.id) FILTER(WHERE r.is_verified IS TRUE)
 FROM public.schedules s JOIN public.get_team_leader_context() c ON c.festival_id=s.festival_id AND c.parent_tenant_id=s.tenant_id JOIN public.organisations o ON o.id=c.organisation_id
 JOIN public.items i ON i.id=s.item_id AND(i.tenant_id IS NULL OR i.tenant_id=c.parent_tenant_id) LEFT JOIN public.venues v ON v.id=s.venue_id AND v.tenant_id=c.parent_tenant_id
 LEFT JOIN public.registrations r ON r.festival_id=s.festival_id AND r.item_id=s.item_id AND r.organisation_id=c.organisation_id AND r.status NOT IN('rejected','cancelled')
 LEFT JOIN public.participants p ON p.id=r.participant_id AND p.festival_id=s.festival_id AND p.organisation_id=c.organisation_id AND p.tenant_id IN(c.parent_tenant_id,o.tenant_id)
 LEFT JOIN public.group_members gm ON gm.registration_id=r.id AND r.entry_kind='general_team' LEFT JOIN public.participants gp ON gp.id=gm.participant_id AND gp.festival_id=s.festival_id AND gp.organisation_id=c.organisation_id AND gp.tenant_id IN(c.parent_tenant_id,o.tenant_id)
 WHERE o.tenant_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.get_visible_organisations(c.parent_tenant_id) v WHERE v.id=o.id AND v.tenant_id=o.tenant_id)
 GROUP BY s.id,s.item_id,i.item_code,i.item_name_en,i.item_name_ml,i.category_codes,v.name,s.start_time,s.end_time,s.status ORDER BY s.start_time NULLS LAST;
$function$;
ALTER FUNCTION "public"."get_team_leader_schedule"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_team_leader_published_results()
 RETURNS TABLE(result_id uuid, item_code text, item_name text, participant_name text, rank integer, grade text, points_awarded integer, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
 SELECT DISTINCT res.id,i.item_code,COALESCE(i.item_name_en,i.item_name_ml),CASE WHEN r.entry_kind='general_team' THEN COALESCE(group_entry_private.chest_number(r),o.name,'General team') ELSE p.name END,res.rank,res.grade,res.points_awarded,res.published_at
 FROM public.results res JOIN public.get_team_leader_context() c ON c.festival_id=res.festival_id AND c.parent_tenant_id=res.tenant_id JOIN public.organisations o ON o.id=c.organisation_id
 JOIN public.items i ON i.id=res.item_id AND(i.tenant_id IS NULL OR i.tenant_id=c.parent_tenant_id) JOIN public.registrations r ON r.id=res.registration_id AND r.festival_id=c.festival_id AND r.organisation_id=c.organisation_id
 LEFT JOIN public.participants p ON p.id=r.participant_id AND p.festival_id=c.festival_id AND p.organisation_id=c.organisation_id AND p.tenant_id IN(c.parent_tenant_id,o.tenant_id)
 WHERE res.published IS TRUE AND res.result_status='published' AND res.public_visible IS TRUE AND o.tenant_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.get_visible_organisations(c.parent_tenant_id) v WHERE v.id=o.id AND v.tenant_id=o.tenant_id) ORDER BY res.published_at DESC NULLS LAST,res.rank NULLS LAST;
$function$;
ALTER FUNCTION "public"."get_team_leader_published_results"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_stage_management_registrations(p_schedule_id uuid DEFAULT NULL::uuid, p_festival_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, item_id uuid, participant_id uuid, organisation_id uuid, status text, is_verified boolean, code_letter text, participant_name text, participant_chest_number text, participant_category_code text, organisation_name text, organisation_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_festival_id uuid;
  v_item_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  IF p_schedule_id IS NOT NULL THEN
    SELECT s.festival_id, s.item_id INTO v_festival_id, v_item_id
    FROM public.schedules s WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The requested schedule does not belong to this tenant.' USING ERRCODE = '42501'; END IF;
  ELSE
    v_festival_id := p_festival_id;
    IF v_festival_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.festival_calendar f WHERE f.id = v_festival_id
        AND f.tenant_id = v_tenant_id AND f.is_active IS TRUE
    ) THEN RAISE EXCEPTION 'The requested festival is not active for this tenant.' USING ERRCODE = '42501'; END IF;
  END IF;

  RETURN QUERY
  SELECT r.id, r.item_id, r.participant_id, r.organisation_id, r.status,
    r.is_verified, r.code_letter,
    CASE WHEN r.entry_kind = 'general_team' THEN group_entry_private.display_name(r) ELSE p.name END,
    COALESCE(group_entry_private.chest_number(r), p.chest_number),
    CASE WHEN r.entry_kind = 'general_team' THEN group_entry_private.category_code(r) ELSE p.category_code END,
    o.name, o.org_type
  FROM public.registrations r
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_festival_id
  LEFT JOIN public.organisations o ON o.id = COALESCE(r.organisation_id, p.organisation_id)
  WHERE r.festival_id = v_festival_id AND (v_item_id IS NULL OR r.item_id = v_item_id)
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible))
    AND (r.entry_kind = 'general_team' OR p.id IS NOT NULL)
  ORDER BY COALESCE(group_entry_private.chest_number(r), p.chest_number) NULLS LAST, p.name, r.id;
END;
$function$;
ALTER FUNCTION "public"."get_stage_management_registrations"(p_schedule_id uuid, p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.stage_update_code_letter(p_schedule_id uuid, p_registration_id uuid, p_code_letter text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside the current tenant scope.' USING ERRCODE = '42501'; END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN RAISE EXCEPTION 'Code letters are locked for this event.' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_registration FROM public.registrations r
  WHERE r.id = p_registration_id AND r.festival_id = v_schedule.festival_id AND r.item_id = v_schedule.item_id
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible));
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration is outside the current schedule scope.' USING ERRCODE = '42501'; END IF;
  IF v_registration.status = 'rejected' OR v_registration.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified and active registrations can receive a code letter.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_schedule.festival_id::text || ':' || v_schedule.item_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.registrations r WHERE r.id <> v_registration.id
    AND r.festival_id = v_schedule.festival_id AND r.item_id = v_schedule.item_id
    AND r.status <> 'rejected' AND r.is_verified IS TRUE
    AND upper(trim(r.code_letter)) = upper(trim(p_code_letter))
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible))) THEN
    RAISE EXCEPTION 'This code letter is already assigned in the event.' USING ERRCODE = '23505';
  END IF;

  v_old := to_jsonb(v_registration);
  UPDATE public.registrations SET code_letter = upper(trim(p_code_letter)) WHERE id = v_registration.id;
  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = v_registration.id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_tenant_id, auth.uid(), 'stage_management_code_letter_update', 'registrations', v_registration.id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id));
  RETURN jsonb_build_object('registration_id', v_registration.id, 'code_letter', upper(trim(p_code_letter)));
END;
$function$;
ALTER FUNCTION "public"."stage_update_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_schedule_registrations(p_schedule_id uuid)
 RETURNS TABLE(id uuid, item_id uuid, participant_id uuid, organisation_id uuid, festival_id uuid, tenant_id uuid, status text, is_verified boolean, code_letter text, participants jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_festival_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  SELECT s.* INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The requested schedule is outside the current tenant scope.' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(v_schedule.festival_id, i.festival_id) INTO v_festival_id
  FROM public.items i WHERE i.id = v_schedule.item_id;
  IF v_festival_id IS NULL THEN RAISE EXCEPTION 'The schedule festival context is missing.' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  SELECT r.id, r.item_id, r.participant_id, r.organisation_id, r.festival_id,
    r.tenant_id, r.status, r.is_verified, r.code_letter,
    CASE WHEN r.entry_kind = 'general_team' THEN jsonb_build_object(
      'id', r.group_leader_participant_id, 'name', group_entry_private.display_name(r),
      'chest_number', group_entry_private.chest_number(r), 'category_code', group_entry_private.category_code(r),
      'organisations', jsonb_build_object('id', o.id, 'name', o.name, 'org_type', o.org_type)
    ) ELSE COALESCE(to_jsonb(p), '{}'::jsonb) END
  FROM public.registrations r
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_festival_id
  LEFT JOIN public.organisations o ON o.id = COALESCE(r.organisation_id, p.organisation_id)
  WHERE r.festival_id = v_festival_id AND r.item_id = v_schedule.item_id
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible))
    AND (r.entry_kind = 'general_team' OR (p.id IS NOT NULL AND (
      p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR p.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible)
    )))
  ORDER BY COALESCE(group_entry_private.chest_number(r), p.chest_number) NULLS LAST, p.name, r.id;
END;
$function$;
ALTER FUNCTION "public"."get_schedule_registrations"(p_schedule_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_stage_management_registrations_scoped(p_schedule_id uuid DEFAULT NULL::uuid, p_festival_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, schedule_id uuid, item_id uuid, participant_id uuid, organisation_id uuid, status text, is_verified boolean, code_letter text, participant_name text, participant_chest_number text, participant_category_code text, organisation_name text, organisation_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_festival_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  IF p_schedule_id IS NOT NULL THEN
    SELECT s.festival_id INTO v_festival_id FROM public.schedules s
    WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The requested schedule does not belong to this tenant.' USING ERRCODE = '42501'; END IF;
  ELSE
    v_festival_id := p_festival_id;
    IF v_festival_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.festival_calendar f WHERE f.id = v_festival_id
        AND f.tenant_id = v_tenant_id AND f.is_active IS TRUE
    ) THEN RAISE EXCEPTION 'The requested festival is not active for this tenant.' USING ERRCODE = '42501'; END IF;
  END IF;

  RETURN QUERY
  SELECT r.id, s.id, r.item_id, r.participant_id, r.organisation_id,
    r.status, r.is_verified, r.code_letter,
    CASE WHEN r.entry_kind = 'general_team' THEN group_entry_private.display_name(r) ELSE p.name END,
    COALESCE(group_entry_private.chest_number(r), p.chest_number),
    CASE WHEN r.entry_kind = 'general_team' THEN group_entry_private.category_code(r) ELSE p.category_code END,
    o.name, o.org_type
  FROM public.registrations r
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_festival_id
  LEFT JOIN public.organisations o ON o.id = COALESCE(r.organisation_id, p.organisation_id)
  JOIN public.schedules s ON s.tenant_id = v_tenant_id AND s.festival_id = v_festival_id
    AND s.item_id = r.item_id AND (p_schedule_id IS NULL OR s.id = p_schedule_id)
  WHERE r.festival_id = v_festival_id
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible))
    AND (r.entry_kind = 'general_team' OR p.id IS NOT NULL)
  ORDER BY COALESCE(group_entry_private.chest_number(r), p.chest_number) NULLS LAST, p.name, r.id, s.id;
END;
$function$;
ALTER FUNCTION "public"."get_stage_management_registrations_scoped"(p_schedule_id uuid, p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_team_leader_participants()
 RETURNS TABLE(id uuid, name text, gender text, category_code text, chest_number text, status text, festival_id uuid, organisation_id uuid, profile_slug text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
 SELECT p.id,p.name,p.gender,p.category_code,p.chest_number,p.status,p.festival_id,p.organisation_id,p.profile_slug FROM public.participants p
 JOIN public.get_team_leader_context() c ON c.festival_id=p.festival_id AND c.organisation_id=p.organisation_id JOIN public.organisations o ON o.id=c.organisation_id
 WHERE auth.uid() IS NOT NULL AND o.tenant_id IS NOT NULL AND p.tenant_id IN(c.parent_tenant_id,o.tenant_id)
 AND EXISTS(SELECT 1 FROM public.get_visible_organisations(c.parent_tenant_id) v WHERE v.id=o.id AND v.tenant_id=o.tenant_id);
$function$;
ALTER FUNCTION "public"."get_team_leader_participants"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.regenerate_festival_chest_numbers_internal(p_festival_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(participant_count integer, category_range integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_range integer;
  v_template text;
  v_invalid_count integer;
  v_oversized_key text;
  v_count integer;
  v_expected_count integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT tenant_id, chest_number_category_range, chest_number_template
    INTO v_tenant_id, v_range, v_template
  FROM public.festival_calendar WHERE id = p_festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Festival not found.'; END IF;

  IF v_template = 'team' THEN
    PERFORM public.ensure_festival_team_chest_slots(p_festival_id);
    SELECT count(*) INTO v_invalid_count FROM public.participants p
    WHERE p.festival_id = p_festival_id AND NOT EXISTS (
      SELECT 1 FROM public.festival_team_chest_slots s
      WHERE s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
    );
    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot regenerate: % participant(s) are not assigned to a team under this festival organisation.', v_invalid_count;
    END IF;
    SELECT s.organisation_id::text INTO v_oversized_key
    FROM public.participants p JOIN public.festival_team_chest_slots s
      ON s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
    WHERE p.festival_id = p_festival_id
    GROUP BY s.organisation_id HAVING count(*) > v_range LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN
      RAISE EXCEPTION 'Team % exceeds the configured chest-number capacity (%).', v_oversized_key, v_range;
    END IF;
  ELSE
    SELECT count(*) INTO v_invalid_count FROM public.participants p
    WHERE p.festival_id = p_festival_id AND
      (p.category_code IS NULL OR pg_catalog.btrim(p.category_code) = '');
    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot regenerate: % participant(s) do not have a category.', v_invalid_count;
    END IF;
    SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code)) INTO v_oversized_key
    FROM public.participants p WHERE p.festival_id = p_festival_id
    GROUP BY pg_catalog.lower(pg_catalog.btrim(p.category_code))
    HAVING count(*) > v_range LIMIT 1;
    IF v_oversized_key IS NOT NULL THEN
      RAISE EXCEPTION 'Category % exceeds the configured chest-number capacity (%).', v_oversized_key, v_range;
    END IF;
  END IF;

  DROP TABLE IF EXISTS pg_temp.chest_number_plan;
  CREATE TEMP TABLE chest_number_plan (
    participant_id uuid PRIMARY KEY, new_chest_number text NOT NULL UNIQUE
  ) ON COMMIT DROP;

  IF v_template = 'team' THEN
    INSERT INTO pg_temp.chest_number_plan(participant_id, new_chest_number)
    SELECT p.id,
      ((s.slot_number * v_range) + row_number() OVER (
        PARTITION BY p.organisation_id ORDER BY
          NULLIF(pg_catalog.regexp_replace(COALESCE(p.chest_number, ''), '[^0-9]', '', 'g'), '')::numeric NULLS LAST,
          pg_catalog.lower(p.name), p.id
      ) - 1)::text
    FROM public.participants p
    JOIN public.festival_team_chest_slots s
      ON s.festival_id = p_festival_id AND s.organisation_id = p.organisation_id
    WHERE p.festival_id = p_festival_id;
  ELSE
    INSERT INTO pg_temp.chest_number_plan(participant_id, new_chest_number)
    WITH category_codes AS (
      SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code
      FROM public.festival_categories fc
      WHERE fc.festival_id = p_festival_id AND pg_catalog.btrim(COALESCE(fc.code, '')) <> ''
      UNION
      SELECT pg_catalog.lower(pg_catalog.btrim(p.category_code))
      FROM public.participants p WHERE p.festival_id = p_festival_id
    ), category_order AS (
      SELECT codes.category_code,
        row_number() OVER (ORDER BY fc.sort_order NULLS LAST, codes.category_code) AS category_position
      FROM category_codes codes
      LEFT JOIN LATERAL (
        SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
        WHERE fc.festival_id = p_festival_id AND pg_catalog.lower(pg_catalog.btrim(fc.code)) = codes.category_code
      ) fc ON true
    )
    SELECT p.id,
      ((co.category_position * v_range) + row_number() OVER (
        PARTITION BY pg_catalog.lower(pg_catalog.btrim(p.category_code)) ORDER BY
          NULLIF(pg_catalog.regexp_replace(COALESCE(p.chest_number, ''), '[^0-9]', '', 'g'), '')::numeric NULLS LAST,
          pg_catalog.lower(p.name), p.id
      ) - 1)::text
    FROM public.participants p
    JOIN category_order co ON co.category_code = pg_catalog.lower(pg_catalog.btrim(p.category_code))
    WHERE p.festival_id = p_festival_id;
  END IF;

  SELECT count(*) INTO v_expected_count FROM public.participants p
  WHERE p.festival_id = p_festival_id;
  SELECT count(*) INTO v_count FROM pg_temp.chest_number_plan;
  IF v_count IS DISTINCT FROM v_expected_count THEN
    RAISE EXCEPTION 'Cannot regenerate: the numbering plan does not cover every participant (% of %).', v_count, v_expected_count;
  END IF;

  -- Move every old value out of the festival's unique index namespace first.
  UPDATE public.participants p SET chest_number = '__regen__' || p.id::text
  WHERE p.festival_id = p_festival_id;
  UPDATE public.participants p SET chest_number = plan.new_chest_number
  FROM pg_temp.chest_number_plan plan WHERE p.id = plan.participant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count IS DISTINCT FROM v_expected_count THEN
    RAISE EXCEPTION 'Cannot regenerate: only % of % participants were updated.', v_count, v_expected_count;
  END IF;
  INSERT INTO public.chest_number_regeneration_audits
    (tenant_id, festival_id, category_range, participant_count, regenerated_by, chest_number_template)
  VALUES (v_tenant_id, p_festival_id, v_range, v_count, p_actor_id, v_template);
  RETURN QUERY SELECT v_count, v_range;
END;
$function$;
ALTER FUNCTION "public"."regenerate_festival_chest_numbers_internal"(p_festival_id uuid, p_actor_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_next_festival_category_chest_number(p_festival_id uuid, p_category_code text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
ALTER FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_public_leaderboard(p_tenant_id uuid DEFAULT NULL::uuid, p_festival_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(organisation_id uuid, organisation_name text, organisation_type text, parent_id uuid, total_points bigint, first_place_count bigint, second_place_count bigint, third_place_count bigint, grade_a_plus_count bigint, grade_a_count bigint, grade_b_count bigint, grade_c_count bigint, result_count bigint, latest_published_at timestamp with time zone, grace_marks_awarded bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  UNION ALL
  SELECT go.id,go.name,go.org_type,go.parent_id,gm.points::bigint,
    0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,NULL::timestamptz,gm.points::bigint
  FROM public.grace_marks gm JOIN public.organisations go ON go.id=gm.org_id
  WHERE v_enable_grace_marks AND gm.festival_id=v_festival_id AND gm.tenant_id=v_festival_tenant_id AND gm.submission_id IS NOT NULL
    AND (go.tenant_id=v_festival_tenant_id OR go.parent_id IN(SELECT id FROM public.organisations WHERE tenant_id=v_festival_tenant_id)
      OR go.tenant_id IN(SELECT o2.tenant_id FROM public.organisations o2 WHERE o2.id=go.parent_id AND o2.tenant_id=v_festival_tenant_id))
    AND NOT EXISTS(SELECT 1 FROM deduped_results dr LEFT JOIN public.registrations gr ON gr.id=dr.registration_id
      LEFT JOIN public.participants gp ON gp.id=gr.participant_id WHERE COALESCE(gr.organisation_id,gp.organisation_id)=go.id)

  ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC, third_place_count DESC, grade_a_count DESC;
END;
$function$;
ALTER FUNCTION "public"."get_public_leaderboard"(p_tenant_id uuid, p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_admin_leaderboard(p_tenant_id uuid DEFAULT NULL::uuid, p_festival_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(organisation_id uuid, organisation_name text, organisation_type text, parent_id uuid, total_points bigint, first_place_count bigint, second_place_count bigint, third_place_count bigint, grade_a_plus_count bigint, grade_a_count bigint, grade_b_count bigint, grade_c_count bigint, result_count bigint, latest_published_at timestamp with time zone, grace_marks_awarded bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  UNION ALL
  SELECT go.id,go.name,go.org_type,go.parent_id,gm.points::bigint,
    0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,NULL::timestamptz,gm.points::bigint
  FROM public.grace_marks gm JOIN public.organisations go ON go.id=gm.org_id
  WHERE v_enable_grace_marks AND gm.festival_id=v_festival_id AND gm.tenant_id=v_festival_tenant_id AND gm.submission_id IS NOT NULL
    AND (go.tenant_id=v_festival_tenant_id OR go.parent_id IN(SELECT id FROM public.organisations WHERE tenant_id=v_festival_tenant_id)
      OR go.tenant_id IN(SELECT o2.tenant_id FROM public.organisations o2 WHERE o2.id=go.parent_id AND o2.tenant_id=v_festival_tenant_id))
    AND NOT EXISTS(SELECT 1 FROM deduped_results dr LEFT JOIN public.registrations gr ON gr.id=dr.registration_id
      LEFT JOIN public.participants gp ON gp.id=gr.participant_id WHERE COALESCE(gr.organisation_id,gp.organisation_id)=go.id)

  ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC,
           organisation_name ASC;
END;
$function$;
ALTER FUNCTION "public"."get_admin_leaderboard"(p_tenant_id uuid, p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.transfer_participant_team(p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_participant public.participants%ROWTYPE;
  v_festival_tenant uuid;
  v_initial_festival_id uuid;
  v_root_org uuid;
  v_target_tenant uuid;
  v_batch_id uuid;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_participant FROM public.participants WHERE id = p_participant_id;
  IF v_participant.id IS NULL OR v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Participant not found or authentication is required.';
  END IF;
  v_initial_festival_id := v_participant.festival_id;
  SELECT f.tenant_id, t.organisation_id INTO v_festival_tenant, v_root_org
  FROM public.festival_calendar f JOIN public.tenants t ON t.id = f.tenant_id
  WHERE f.id = v_participant.festival_id;
  IF v_actor.is_superadmin IS NOT TRUE AND
     (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning festival admin may transfer participants.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_participant.festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT * INTO v_participant FROM public.participants WHERE id = p_participant_id FOR UPDATE;
  IF v_participant.id IS NULL OR v_participant.festival_id IS DISTINCT FROM v_initial_festival_id THEN
    RAISE EXCEPTION 'Participant changed during transfer.';
  END IF;
  SELECT o.tenant_id INTO v_target_tenant FROM public.organisations o
  WHERE o.id = p_new_org_id AND o.parent_id = v_root_org;
  IF v_target_tenant IS NULL THEN RAISE EXCEPTION 'Select a team under this festival organisation.'; END IF;
  IF v_participant.organisation_id = p_new_org_id THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.participants p
             WHERE p.id <> p_participant_id AND p.organisation_id = p_new_org_id
               AND pg_catalog.lower(pg_catalog.btrim(p.name)) = pg_catalog.lower(pg_catalog.btrim(v_participant.name))) THEN
    RAISE EXCEPTION 'A participant with this exact name already exists in the selected team.';
  END IF;
  INSERT INTO public.participant_unit_batches
    (status, total_records, success_count, processed_count, created_by, tenant_id, target_unit_id, completed_at)
  VALUES ('completed', 1, 1, 1, v_actor.id, v_festival_tenant, p_new_org_id, now())
  RETURNING id INTO v_batch_id;
  UPDATE public.participants SET organisation_id = p_new_org_id,
    tenant_id = v_target_tenant, updated_at = now()
  WHERE id = p_participant_id;
  UPDATE public.registrations SET organisation_id = p_new_org_id, tenant_id = v_target_tenant
  WHERE participant_id = p_participant_id AND (is_group_registration = false OR is_group_registration IS NULL);
  INSERT INTO public.participant_unit_audit_logs
    (participant_id, old_unit_id, new_unit_id, changed_by, batch_id, tenant_id)
  VALUES (p_participant_id, v_participant.organisation_id, p_new_org_id, v_actor.id, v_batch_id, v_festival_tenant);
END;
$function$;
ALTER FUNCTION "public"."transfer_participant_team"(p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.calculate_festival_points(p_festival_id uuid, p_grade text, p_rank integer, p_group_size integer, p_competing_teams_count integer, p_is_group boolean DEFAULT false, p_bracket_override text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE c public.points_config; BEGIN
  SELECT * INTO c FROM public.points_config WHERE festival_id=p_festival_id;
  PERFORM scoring_private.assert_admin(c.tenant_id);
  IF c.id IS NULL THEN RAISE EXCEPTION 'Configure points before calculating awards.'; END IF;
  PERFORM scoring_private.validate_config(to_jsonb(c));
  IF cardinality(c.grade_boost_item_ids)>0 OR cardinality(c.rank_boost_item_ids)>0 THEN RAISE EXCEPTION 'Use the competition-scoped scoring API for configured boosts.'; END IF;
  RETURN scoring_private.award(to_jsonb(c),NULL,p_grade,p_rank,p_group_size,p_competing_teams_count,p_is_group,p_bracket_override);
END $function$;
ALTER FUNCTION "public"."calculate_festival_points"(p_festival_id uuid, p_grade text, p_rank integer, p_group_size integer, p_competing_teams_count integer, p_is_group boolean, p_bracket_override text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.admin_upsert_mark(p_schedule_id uuid, p_judge_id uuid, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_max_mark numeric, p_criteria_snapshot jsonb, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_schedule public.schedules%ROWTYPE;
  v_mark public.mark_entries%ROWTYPE;
  v_existing_id uuid;
  v_existing_is_final boolean;
  v_entry_mode text;
  v_scores jsonb;
  v_snapshot jsonb;
BEGIN
  SELECT s.*
  INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id;

  IF NOT FOUND OR v_schedule.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Schedule was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_superadmin IS TRUE
        OR p.role = 'super_admin'
        OR (
          p.role IN ('tenant_admin', 'festival_admin', 'admin')
          AND p.tenant_id = v_schedule.tenant_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Administrator access to this tenant is required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_status IS DISTINCT FROM 'final' THEN
    RAISE EXCEPTION 'Administrator mark corrections must remain finalized.';
  END IF;
  IF p_total_mark IS NULL OR p_max_mark IS NULL OR p_max_mark <= 0
     OR p_total_mark < 0 OR p_total_mark > p_max_mark THEN
    RAISE EXCEPTION 'Mark must be within its configured maximum.';
  END IF;

  v_scores := COALESCE(p_criteria_scores, '{}'::jsonb);
  v_snapshot := COALESCE(p_criteria_snapshot, '[]'::jsonb);
  IF jsonb_typeof(v_scores) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_snapshot) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid scoring data.';
  END IF;
  v_entry_mode := CASE WHEN v_scores = '{}'::jsonb THEN 'total_only' ELSE 'criteria' END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    JOIN public.judges j ON j.id = a.judge_id AND j.tenant_id = a.tenant_id
    WHERE a.schedule_id = p_schedule_id
      AND a.judge_id = p_judge_id
      AND a.tenant_id = v_schedule.tenant_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected judge is not actively assigned to this schedule.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM scoring_private.eligible(v_schedule) r
    WHERE r.id = p_registration_id
  ) THEN
    RAISE EXCEPTION 'Registration is outside this schedule or is not eligible.'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize saves to this exact judge/registration mark. No other mark row
  -- for the schedule is touched by this function.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_schedule_id::text || ':' || p_judge_id::text || ':' || p_registration_id::text,
    0
  ));

  SELECT m.id, m.is_final
  INTO v_existing_id, v_existing_is_final
  FROM public.mark_entries m
  WHERE m.schedule_id = p_schedule_id
    AND m.judge_id = p_judge_id
    AND m.registration_id = p_registration_id
    AND m.tenant_id = v_schedule.tenant_id
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    -- The existing validator permits reopening a finalized row only when that
    -- statement changes is_final alone. Both statements run in this RPC's
    -- transaction; the committed row is final again, or the whole save rolls back.
    IF v_existing_is_final IS TRUE THEN
      UPDATE public.mark_entries
      SET is_final = false
      WHERE id = v_existing_id;
    END IF;

    UPDATE public.mark_entries
    SET criteria_scores = v_scores,
        total_mark = p_total_mark,
        entry_mode_snapshot = v_entry_mode,
        max_mark_snapshot = p_max_mark,
        criteria_snapshot = v_snapshot,
        is_draft = false,
        is_final = true,
        submitted_at = COALESCE(submitted_at, now()),
        updated_at = now()
    WHERE id = v_existing_id
    RETURNING * INTO v_mark;
  ELSE
    INSERT INTO public.mark_entries (
      tenant_id, schedule_id, judge_id, registration_id,
      criteria_scores, total_mark, entry_mode_snapshot,
      max_mark_snapshot, criteria_snapshot, is_draft, is_final,
      submitted_at, updated_at
    ) VALUES (
      v_schedule.tenant_id, p_schedule_id, p_judge_id, p_registration_id,
      v_scores, p_total_mark, v_entry_mode,
      p_max_mark, v_snapshot, false, true, now(), now()
    )
    RETURNING * INTO v_mark;
  END IF;

  RETURN jsonb_build_object(
    'id', v_mark.id,
    'schedule_id', v_mark.schedule_id,
    'judge_id', v_mark.judge_id,
    'registration_id', v_mark.registration_id,
    'is_draft', v_mark.is_draft,
    'is_final', v_mark.is_final,
    'total_mark', v_mark.total_mark,
    'updated_at', v_mark.updated_at
  );
END;
$function$;
ALTER FUNCTION "public"."admin_upsert_mark"(p_schedule_id uuid, p_judge_id uuid, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_max_mark numeric, p_criteria_snapshot jsonb, p_status text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.unlock_schedule_marks(p_schedule_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT s.tenant_id
  INTO v_tenant_id
  FROM public.schedules s
  WHERE s.id = p_schedule_id;

  IF NOT FOUND OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Schedule was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_superadmin IS TRUE
        OR p.role = 'super_admin'
        OR (
          p.role IN ('tenant_admin', 'festival_admin', 'admin')
          AND p.tenant_id = v_tenant_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Administrator access to this tenant is required.'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize with result publication only after confirming tenant access.
  PERFORM 1
  FROM public.schedules s
  WHERE s.id = p_schedule_id
    AND s.tenant_id = v_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule changed while enabling mark editing.' USING ERRCODE = '40001';
  END IF;

  -- Deliberately do not update mark_entries or change any is_final flag.
  -- Results are withdrawn so clients cannot see stale scores during correction.
  UPDATE public.results r
  SET result_status = 'draft',
      published = false
  WHERE r.schedule_id = p_schedule_id
    AND r.result_status IN ('published', 'ready');
END;
$function$;
ALTER FUNCTION "public"."unlock_schedule_marks"(p_schedule_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_leaderboard_preview(p_tenant_id uuid, p_festival_id uuid, p_ranking_mode text, p_item_limit integer, p_use_public_only boolean DEFAULT false)
 RETURNS TABLE(organisation_id uuid, organisation_name text, organisation_type text, parent_id uuid, total_points bigint, first_place_count bigint, second_place_count bigint, third_place_count bigint, grade_a_plus_count bigint, grade_a_count bigint, grade_b_count bigint, grade_c_count bigint, result_count bigint, latest_published_at timestamp with time zone, grace_marks_awarded bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  UNION ALL
  SELECT go.id,go.name,go.org_type,go.parent_id,gm.points::bigint,
    0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,NULL::timestamptz,gm.points::bigint
  FROM public.grace_marks gm JOIN public.organisations go ON go.id=gm.org_id
  WHERE v_enable_grace_marks AND gm.festival_id=v_festival_id AND gm.tenant_id=v_festival_tenant_id AND gm.submission_id IS NOT NULL
    AND (go.tenant_id=v_festival_tenant_id OR go.parent_id IN(SELECT id FROM public.organisations WHERE tenant_id=v_festival_tenant_id)
      OR go.tenant_id IN(SELECT o2.tenant_id FROM public.organisations o2 WHERE o2.id=go.parent_id AND o2.tenant_id=v_festival_tenant_id))
    AND NOT EXISTS(SELECT 1 FROM deduped_results dr LEFT JOIN public.registrations gr ON gr.id=dr.registration_id
      LEFT JOIN public.participants gp ON gp.id=gr.participant_id WHERE COALESCE(gr.organisation_id,gp.organisation_id)=go.id)

  ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC, third_place_count DESC, grade_a_count DESC;
END;
$function$;
ALTER FUNCTION "public"."get_leaderboard_preview"(p_tenant_id uuid, p_festival_id uuid, p_ranking_mode text, p_item_limit integer, p_use_public_only boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.award(c jsonb, item uuid, grade text, place integer, size integer, teams integer, is_group boolean, bracket_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE b jsonb; rows jsonb; vals jsonb; gp integer:=0; rp integer:=0; gi integer; gboost boolean; rboost boolean;
  small boolean; profile text; gs jsonb; rs jsonb; BEGIN
  IF size IS NULL OR size<1 OR teams IS NULL OR teams<0 OR (place IS NOT NULL AND place<1) THEN RAISE EXCEPTION 'Invalid scoring input counts.'; END IF;
  IF grade IS NOT NULL AND grade NOT IN ('A+','A','B','C') THEN RAISE EXCEPTION 'Unknown grade.'; END IF;
  rows:=CASE WHEN is_group AND COALESCE((c->>'separate_group_brackets')::boolean,false) THEN c->'group_point_brackets' ELSE c->'point_brackets' END;
  SELECT value INTO b FROM jsonb_array_elements(rows)
    WHERE COALESCE((value->>'enabled')::boolean,true)
    ORDER BY (value->>'min')::integer,value->>'key' LIMIT 1;
  IF b IS NULL THEN RAISE EXCEPTION 'No default grade points are configured.'; END IF;
  IF bracket_key IS NOT NULL AND bracket_key IS DISTINCT FROM b->>'key' THEN
    RAISE EXCEPTION 'Only the default grade points may be used.';
  END IF;
  SELECT value INTO gs FROM jsonb_array_elements(COALESCE(c->'grade_boost_sections','[]'::jsonb)) WHERE (value->'item_ids') ? item::text LIMIT 1;
  SELECT value INTO rs FROM jsonb_array_elements(COALESCE(c->'rank_boost_sections','[]'::jsonb)) WHERE (value->'item_ids') ? item::text LIMIT 1;
  gboost:=gs IS NOT NULL OR COALESCE((c->'grade_boost_item_ids') ? item::text,false);
  rboost:=rs IS NOT NULL OR COALESCE((c->'rank_boost_item_ids') ? item::text,false);
  IF gboost AND NOT COALESCE((c->>'grade_boost_enabled')::boolean,true) THEN RAISE EXCEPTION 'Grade Boost is disabled while this competition is assigned.'; END IF;
  IF rboost AND NOT COALESCE((c->>'rank_boost_enabled')::boolean,true) THEN RAISE EXCEPTION 'Rank Boost is disabled while this competition is assigned.'; END IF;
  profile:=CASE WHEN gboost AND rboost THEN 'both' WHEN gboost THEN 'grade_boost' WHEN rboost THEN 'rank_boost' ELSE 'baseline' END;
  IF gboost THEN
    vals:=CASE WHEN gs IS NOT NULL THEN CASE WHEN is_group AND COALESCE((c->>'separate_group_brackets')::boolean,false) THEN gs->'group_points'->(b->>'key') ELSE gs->'points'->(b->>'key') END
      WHEN is_group AND COALESCE((c->>'separate_group_brackets')::boolean,false) THEN c->'group_grade_boost_points'->(b->>'key') ELSE c->'grade_boost_points'->(b->>'key') END;
  ELSE vals:=b->'points'; END IF;
  gi:=CASE grade WHEN 'A+' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE NULL END;
  IF gi IS NOT NULL THEN gp:=scoring_private.whole(vals->gi); END IF;
  IF place BETWEEN 1 AND 3 THEN
    IF rboost AND rs IS NOT NULL THEN rp:=scoring_private.whole(rs->'points'->(place-1));
    ELSIF rboost THEN rp:=scoring_private.whole(c->'rank_boost_points'->(place-1));
    ELSE rp:=scoring_private.whole(c->('rank_'||place||'_points')); END IF;
  END IF;
  small:=(c->>'less_than_3_teams_rule')::boolean AND teams<(c->>'rule12_min_teams')::integer;
  IF small AND c->>'rule12_behavior'<>'rank_and_grade' THEN rp:=0; END IF;
  IF small AND c->>'rule12_behavior'='no_points' THEN gp:=0; END IF;
  RETURN jsonb_build_object('total',rp+gp,'rank_points',rp,'grade_points',gp,'profile',profile,'bracket_key',b->>'key','bracket_label',b->>'label',
    'rule12_applied',COALESCE(small,false),'rule12_behavior',c->>'rule12_behavior','grade_only',COALESCE(small,false) AND c->>'rule12_behavior'='grade_only',
    'config_version',(c->>'config_version')::integer,'group_size',size,'competing_teams_count',teams,'is_group',is_group);
END $function$;
ALTER FUNCTION "scoring_private"."award"(c jsonb, item uuid, grade text, place integer, size integer, teams integer, is_group boolean, bracket_key text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.eligible(s schedules)
 RETURNS SETOF registrations
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH RECURSIVE tree AS (
    SELECT o.id FROM public.organisations o WHERE o.id=(SELECT organisation_id FROM public.tenants WHERE id=s.tenant_id)
      OR (NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=s.tenant_id AND organisation_id IS NOT NULL) AND o.tenant_id=s.tenant_id)
    UNION SELECT o.id FROM public.organisations o JOIN tree t ON o.parent_id=t.id
  )
  SELECT r.* FROM public.registrations r LEFT JOIN public.participants p ON p.id=r.participant_id
  WHERE r.item_id=s.item_id AND r.festival_id=s.festival_id AND r.status IS DISTINCT FROM 'rejected'
    AND r.is_verified IS TRUE AND nullif(btrim(r.code_letter),'') IS NOT NULL
    AND (r.tenant_id=s.tenant_id OR COALESCE(r.organisation_id,p.organisation_id) IN(SELECT id FROM tree));
$function$;
ALTER FUNCTION "scoring_private"."eligible"(s schedules) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.prepare_results(p_schedule uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_size integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE s public.schedules; item public.items; c public.points_config; reg public.registrations;
  entry jsonb; input jsonb; inputs jsonb:='[]'; scores jsonb:='{}'; pct numeric; raw numeric; maximum numeric;
  total numeric; count_entries integer; teams integer; size integer; grade text; placement integer; row record; calc jsonb;
BEGIN
  SELECT * INTO s FROM public.schedules WHERE id=p_schedule;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Schedule was not found.'; END IF;
  PERFORM scoring_private.assert_admin(s.tenant_id);
  SELECT * INTO c FROM public.points_config WHERE festival_id=s.festival_id AND tenant_id=s.tenant_id FOR SHARE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Configure points before publishing results.'; END IF;
  IF c.config_version IS DISTINCT FROM p_expected_version
    THEN RAISE EXCEPTION 'Configuration changed. Refresh the preview.' USING ERRCODE='40001'; END IF;
  PERFORM scoring_private.validate_config(to_jsonb(c));
  SELECT * INTO item FROM public.items WHERE id=s.item_id AND festival_id=s.festival_id AND tenant_id=s.tenant_id;
  IF item.id IS NULL OR cardinality(item.category_codes) IS DISTINCT FROM 1
    THEN RAISE EXCEPTION 'Resolve this competition to one owned item/category before publishing.'; END IF;
  IF p_mode NOT IN ('judges','manual') OR p_mode IS NULL OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Invalid results entry mode.'; END IF;
  SELECT count(*) INTO teams FROM scoring_private.eligible(s);
  IF teams=0 OR jsonb_array_length(p_entries)<>teams OR
    (SELECT count(DISTINCT value->>'registration_id') FROM jsonb_array_elements(p_entries))<>teams
    THEN RAISE EXCEPTION 'Every eligible registration must be included exactly once.'; END IF;
  SELECT greatest(1,COALESCE(max(CASE WHEN jsonb_typeof(r.raw_group_members)='array'
    AND jsonb_array_length(r.raw_group_members)>0 THEN jsonb_array_length(r.raw_group_members)
    ELSE 1+(SELECT count(*) FROM public.group_members g WHERE g.registration_id=r.id) END),1))::integer
    INTO size FROM scoring_private.eligible(s) r;
  IF item.participation_type<>'group' THEN size:=1;
  ELSIF item.source='custom' AND item.group_min_members>0 AND item.group_min_members=item.group_max_members
    THEN size:=item.group_min_members;
  END IF;
  IF p_size IS NOT NULL THEN
    IF NOT c.member_brackets_enabled THEN RAISE EXCEPTION 'Member-based scoring is disabled for this festival.'; END IF;
    IF item.source='custom' AND item.participation_type='group' AND item.group_min_members>0
      AND item.group_min_members=item.group_max_members
      THEN RAISE EXCEPTION 'This competition already has a configured group size.'; END IF;
    IF NOT (item.category_codes && ARRAY['GN','GENERAL']) OR p_size<1
      THEN RAISE EXCEPTION 'Only a General competition permits a manual group-size override.'; END IF;
    size:=p_size;
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    SELECT * INTO reg FROM scoring_private.eligible(s) WHERE id=(entry->>'registration_id')::uuid;
    IF reg.id IS NULL THEN RAISE EXCEPTION 'Registration is outside this event or is ineligible.'; END IF;
    pct:=0; raw:=0; count_entries:=0; inputs:='[]';
    IF p_mode='manual' THEN
      IF jsonb_typeof(entry->'raw_marks') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'raw_marks')=0
        THEN RAISE EXCEPTION 'Enter raw marks and their maximum for every registration.'; END IF;
      FOR input IN SELECT value FROM jsonb_array_elements(entry->'raw_marks') LOOP
        IF jsonb_typeof(input->'total') IS DISTINCT FROM 'number' OR jsonb_typeof(input->'maximum') IS DISTINCT FROM 'number'
          THEN RAISE EXCEPTION 'Invalid raw marks.'; END IF;
        total:=(input->>'total')::numeric; maximum:=(input->>'maximum')::numeric;
        IF maximum<=0 OR total<0 OR total>maximum THEN RAISE EXCEPTION 'Marks must be within their recorded maximum.'; END IF;
        pct:=pct+total/maximum*100; raw:=raw+total; count_entries:=count_entries+1; inputs:=inputs||jsonb_build_array(input);
      END LOOP;
    ELSE
      FOR row IN SELECT m.* FROM public.mark_entries m WHERE m.schedule_id=s.id AND m.registration_id=reg.id
        AND m.tenant_id=s.tenant_id AND m.is_final IS TRUE
        AND EXISTS(SELECT 1 FROM public.schedule_judge_assignments a WHERE a.schedule_id=s.id AND a.judge_id=m.judge_id
          AND a.tenant_id=s.tenant_id AND a.status='active') FOR SHARE OF m LOOP
        IF row.total_mark IS NULL OR row.max_mark_snapshot IS NULL OR row.max_mark_snapshot<=0
          OR row.total_mark<0 OR row.total_mark>row.max_mark_snapshot
          THEN RAISE EXCEPTION 'A final mark has no valid maximum snapshot. An administrator must review it.'; END IF;
        pct:=pct+row.total_mark/row.max_mark_snapshot*100; raw:=raw+row.total_mark; count_entries:=count_entries+1;
        inputs:=inputs||jsonb_build_array(jsonb_build_object('mark_id',row.id,'total',row.total_mark,'maximum',row.max_mark_snapshot));
      END LOOP;
    END IF;
    IF count_entries=0 THEN RAISE EXCEPTION 'No final marks exist for an eligible registration.'; END IF;
    pct:=pct/count_entries; raw:=round(raw/count_entries,2);
    SELECT key INTO grade FROM jsonb_each(c.grade_thresholds) WHERE pct>=value::text::numeric
      ORDER BY value::text::numeric DESC LIMIT 1;
    grade:=CASE grade WHEN 'a_plus' THEN 'A+' WHEN 'a' THEN 'A' WHEN 'b' THEN 'B' WHEN 'c' THEN 'C' ELSE NULL END;
    scores:=scores||jsonb_build_object(reg.id::text,jsonb_build_object('percentage',pct,'total_score',raw,'grade',grade,'inputs',inputs));
  END LOOP;
  FOR row IN SELECT key,value,rank() OVER(ORDER BY (value->>'percentage')::numeric DESC)::integer AS position FROM jsonb_each(scores) LOOP
    placement:=CASE WHEN (row.value->>'percentage')::numeric>0 AND row.position<=5 THEN row.position ELSE NULL END;
    calc:=scoring_private.award(to_jsonb(c),item.id,row.value->>'grade',placement,size,teams,item.participation_type='group',p_bracket);
    scores:=jsonb_set(scores,ARRAY[row.key],row.value||jsonb_build_object('rank',placement,'calculation',calc));
  END LOOP;
  RETURN jsonb_build_object('results',scores,'config_version',c.config_version,'tenant_id',s.tenant_id,
    'festival_id',s.festival_id,'item_id',item.id);
END $function$;
ALTER FUNCTION "scoring_private"."prepare_results"(p_schedule uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_size integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.preview_competition_points(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text DEFAULT NULL::text, p_group_size integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$ BEGIN
  RETURN scoring_private.prepare_results(p_schedule_id,p_expected_version,p_entries,p_mode,p_bracket,p_group_size);
END $function$;
ALTER FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.publish_competition_results(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text DEFAULT NULL::text, p_group_size integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE p public.scoring_publications; prepared jsonb; sealed jsonb:='{}'; row record; payload jsonb; fingerprint text; owner uuid;
BEGIN
  SELECT tenant_id INTO owner FROM public.schedules WHERE id=p_schedule_id;
  PERFORM scoring_private.assert_admin(owner);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Publication request identity is required.'; END IF;
  fingerprint:=md5(jsonb_build_array(p_schedule_id,p_expected_version,p_entries,p_mode,p_bracket,p_group_size)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO p FROM public.scoring_publications WHERE id=p_request_id;
  IF p.id IS NOT NULL THEN
    IF p.tenant_id<>owner OR p.input_hash<>fingerprint THEN RAISE EXCEPTION 'Publication request has different inputs.'; END IF;
    RETURN jsonb_build_object('publication_id',p.id,'config_version',p.config_version);
  END IF;
  prepared:=scoring_private.prepare_results(p_schedule_id,p_expected_version,p_entries,p_mode,p_bracket,p_group_size);
  PERFORM 1 FROM public.schedules WHERE id=p_schedule_id FOR UPDATE;
  FOR row IN SELECT key,value FROM jsonb_each(prepared->'results') LOOP
    payload:=jsonb_build_object('tenant_id',owner,'festival_id',prepared->>'festival_id','schedule_id',p_schedule_id,
      'item_id',prepared->>'item_id','registration_id',row.key,'total_score',row.value->'total_score','rank',row.value->'rank','grade',row.value->'grade',
      'points_awarded',row.value->'calculation'->'total','grade_only',row.value->'calculation'->'grade_only',
      'points_config_version',p_expected_version,'points_calculation',(row.value->'calculation')||jsonb_build_object('publication_id',p_request_id,'inputs',row.value->'inputs','percentage',row.value->'percentage'),
      'collection_method',p_mode);
    sealed:=sealed||jsonb_build_object(row.key,payload);
  END LOOP;
  INSERT INTO public.scoring_publications(id,tenant_id,festival_id,schedule_id,item_id,config_version,input_hash,results_payload,previous_results,created_by)
  VALUES(p_request_id,owner,(prepared->>'festival_id')::uuid,p_schedule_id,(prepared->>'item_id')::uuid,p_expected_version,fingerprint,sealed,
    COALESCE((SELECT jsonb_agg(to_jsonb(old)) FROM public.results old WHERE old.tenant_id=owner AND old.festival_id=(prepared->>'festival_id')::uuid AND old.item_id=(prepared->>'item_id')::uuid),'[]'),auth.uid());
  FOR row IN SELECT value FROM jsonb_each(sealed) LOOP
    INSERT INTO public.results(tenant_id,festival_id,schedule_id,item_id,registration_id,total_score,rank,grade,points_awarded,grade_only,points_config_version,points_calculation,collection_method,published,published_at,result_status,public_visible)
    SELECT x.tenant_id,x.festival_id,x.schedule_id,x.item_id,x.registration_id,x.total_score,x.rank,x.grade,x.points_awarded,x.grade_only,x.points_config_version,x.points_calculation,x.collection_method,true,now(),'published',false
    FROM jsonb_populate_record(NULL::public.results,row.value) x
    ON CONFLICT(registration_id,item_id) DO UPDATE SET schedule_id=EXCLUDED.schedule_id,total_score=EXCLUDED.total_score,rank=EXCLUDED.rank,grade=EXCLUDED.grade,
      points_awarded=EXCLUDED.points_awarded,grade_only=EXCLUDED.grade_only,points_config_version=EXCLUDED.points_config_version,points_calculation=EXCLUDED.points_calculation,
      collection_method=EXCLUDED.collection_method,published=true,published_at=now(),result_status='published',public_visible=false;
  END LOOP;
  UPDATE public.schedules SET official_participant_bracket=(SELECT value->'points_calculation'->>'bracket_key' FROM jsonb_each(sealed) LIMIT 1) WHERE id=p_schedule_id;
  RETURN jsonb_build_object('publication_id',p_request_id,'config_version',p_expected_version);
END $function$;
ALTER FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.assert_admin(p_tenant uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
      AND (p.is_superadmin IS TRUE OR (p.role='admin' AND p.tenant_id=p_tenant AND public.get_my_tenant_id()=p_tenant))
  ) THEN RAISE EXCEPTION 'Administrator access to this tenant is required.' USING ERRCODE='42501'; END IF;
END $function$;
ALTER FUNCTION "scoring_private"."assert_admin"(p_tenant uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.whole(v jsonb, positive boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE n numeric; BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'A configured whole number is required.'; END IF;
  n := v::text::numeric;
  IF n<>trunc(n) OR n<0 OR n>2147483647 OR (positive AND n=0) THEN RAISE EXCEPTION 'Configured number is outside its permitted range.'; END IF;
  RETURN n::integer;
END $function$;
ALTER FUNCTION "scoring_private"."whole"(v jsonb, positive boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.validate_config(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE k text; a numeric; prev numeric; b jsonb; f jsonb; rows jsonb; max_end integer; first_row boolean;
  min_start integer; max_value integer; keys text[]; names text[]; boost_key text; i integer;
BEGIN
  FOREACH k IN ARRAY ARRAY['rank_1_points','rank_2_points','rank_3_points'] LOOP PERFORM scoring_private.whole(p->k); END LOOP;
  prev := NULL;
  FOREACH k IN ARRAY ARRAY['a_plus','a','b','c'] LOOP
    IF jsonb_typeof(p->'grade_thresholds'->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Complete grade percentage thresholds.'; END IF;
    a := (p->'grade_thresholds'->>k)::numeric;
    IF a<0 OR a>100 OR (prev IS NOT NULL AND a>=prev) THEN RAISE EXCEPTION 'Grade percentages must be ordered A+ > A > B > C.'; END IF;
    prev := a;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['separate_group_brackets','auto_bracket_selection','allow_bracket_override','less_than_3_teams_rule','enable_grace_marks'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Complete scoring switches: %', k; END IF;
  END LOOP;
  IF (p->>'less_than_3_teams_rule')::boolean THEN
    PERFORM scoring_private.whole(p->'rule12_min_teams',true);
    IF p->>'rule12_behavior' IS NULL OR p->>'rule12_behavior' NOT IN ('grade_only','rank_and_grade','no_points') THEN
      RAISE EXCEPTION 'Complete minimum-team behaviour.';
    END IF;
  END IF;
  FOREACH k IN ARRAY ARRAY['grade_boost_item_ids','rank_boost_item_ids','grace_fields'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid configuration list: %',k; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['point_brackets','group_point_brackets'] LOOP
    IF k='group_point_brackets' AND NOT (p->>'separate_group_brackets')::boolean THEN CONTINUE; END IF;
    rows:=p->k; keys:='{}'; max_end:=NULL; first_row:=true;
    IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows)=0 THEN RAISE EXCEPTION 'Add configured participant brackets.'; END IF;
    boost_key:=CASE WHEN k='point_brackets' THEN 'grade_boost_points' ELSE 'group_grade_boost_points' END;
    FOR b IN SELECT value FROM jsonb_array_elements(rows) ORDER BY (value->>'min')::numeric LOOP
      min_start:=scoring_private.whole(b->'min',true);
      IF NOT b ? 'max' THEN RAISE EXCEPTION 'A bracket maximum or explicit open end is required.'; END IF;
      max_value:=CASE WHEN b->'max'='null'::jsonb THEN NULL ELSE scoring_private.whole(b->'max',true) END;
      IF max_value<min_start OR nullif(btrim(b->>'key'),'') IS NULL OR (b->>'key')=ANY(keys) THEN RAISE EXCEPTION 'Invalid or duplicate bracket.'; END IF;
      keys:=array_append(keys,b->>'key');
      IF jsonb_typeof(b->'points') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'points')<>4 THEN RAISE EXCEPTION 'Complete every grade value in each bracket.'; END IF;
      FOR i IN 0..3 LOOP PERFORM scoring_private.whole(b->'points'->i); END LOOP;
      IF COALESCE((b->>'enabled')::boolean,true) THEN
        IF NOT first_row AND (max_end IS NULL OR min_start<=max_end) THEN RAISE EXCEPTION 'Enabled bracket ranges overlap.'; END IF;
        first_row:=false; max_end:=max_value;
        IF jsonb_array_length(p->'grade_boost_item_ids')>0 THEN
          f:=p->boost_key->(b->>'key');
          IF jsonb_typeof(f) IS DISTINCT FROM 'array' OR jsonb_array_length(f)<>4 THEN RAISE EXCEPTION 'Complete boosted grade values for bracket %.',b->>'key'; END IF;
          FOR i IN 0..3 LOOP PERFORM scoring_private.whole(f->i); END LOOP;
        END IF;
      END IF;
    END LOOP;
    IF first_row THEN RAISE EXCEPTION 'At least one bracket must be enabled.'; END IF;
  END LOOP;
  IF jsonb_array_length(p->'rank_boost_item_ids')>0 THEN
    IF jsonb_typeof(p->'rank_boost_points') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rank_boost_points')<>3 THEN RAISE EXCEPTION 'Complete boosted rank values.'; END IF;
    FOR i IN 0..2 LOOP PERFORM scoring_private.whole(p->'rank_boost_points'->i); END LOOP;
  END IF;
  keys:='{}'; names:='{}';
  FOR f IN SELECT value FROM jsonb_array_elements(p->'grace_fields') LOOP
    PERFORM (f->>'id')::uuid;
    IF nullif(f->>'id','') IS NULL OR (f->>'id')=ANY(keys) OR nullif(btrim(f->>'name'),'') IS NULL OR lower(btrim(f->>'name'))=ANY(names) THEN RAISE EXCEPTION 'Grace fields need unique IDs and names.'; END IF;
    PERFORM scoring_private.whole(f->'max_marks',true);
    keys:=array_append(keys,f->>'id'); names:=array_append(names,lower(btrim(f->>'name')));
  END LOOP;
END $function$;
ALTER FUNCTION "scoring_private"."validate_config"(p jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.check_config_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE item uuid; BEGIN
  PERFORM scoring_private.assert_admin(NEW.tenant_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.festival_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.festival_calendar f WHERE f.id=NEW.festival_id AND f.tenant_id=NEW.tenant_id)
    THEN RAISE EXCEPTION 'Festival is outside configuration ownership.'; END IF;
  PERFORM scoring_private.validate_config(jsonb_set(jsonb_set(to_jsonb(NEW),'{grade_boost_item_ids}','[]'::jsonb),'{rank_boost_item_ids}','[]'::jsonb));
  PERFORM scoring_private.validate_boost_sections(to_jsonb(NEW));
  IF NOT NEW.grade_boost_enabled AND cardinality(NEW.grade_boost_item_ids)>0 THEN RAISE EXCEPTION 'Remove Grade Boost competitions before turning it off.'; END IF;
  IF NOT NEW.rank_boost_enabled AND cardinality(NEW.rank_boost_item_ids)>0 THEN RAISE EXCEPTION 'Remove Rank Boost competitions before turning it off.'; END IF;
  FOREACH item IN ARRAY (NEW.grade_boost_item_ids || NEW.rank_boost_item_ids) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.items i WHERE i.id=item AND i.tenant_id=NEW.tenant_id AND i.festival_id=NEW.festival_id AND cardinality(i.category_codes)=1)
      THEN RAISE EXCEPTION 'Boost selections require an owned, single-category competition.'; END IF;
  END LOOP;
  RETURN NEW;
END $function$;
ALTER FUNCTION "scoring_private"."check_config_write"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.save_scoring_configuration(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text)
 RETURNS points_config
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE old public.points_config; v public.points_config; owner uuid; grade_sections jsonb; rank_sections jsonb;
  grade_ids uuid[]; rank_ids uuid[]; BEGIN
  SELECT tenant_id INTO owner FROM public.festival_calendar WHERE id=p_festival_id;
  PERFORM scoring_private.assert_admin(owner);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text,0));
  SELECT * INTO old FROM public.points_config WHERE festival_id=p_festival_id AND tenant_id=owner FOR UPDATE;
  IF COALESCE(old.config_version,0) IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Configuration changed. Reload before saving.' USING ERRCODE='40001'; END IF;
  IF old.id IS NOT NULL AND NOT (p_config ? 'grade_boost_sections') AND
    (jsonb_array_length(old.grade_boost_sections)>1 OR jsonb_array_length(old.rank_boost_sections)>1)
    THEN RAISE EXCEPTION 'This client cannot edit multiple boost sections. Reload with the latest app before saving.'; END IF;
  v:=jsonb_populate_record(NULL::public.points_config,p_config);
  grade_sections:=CASE WHEN p_config ? 'grade_boost_sections' THEN v.grade_boost_sections ELSE
    jsonb_build_array(jsonb_build_object('id',COALESCE(old.grade_boost_sections->0->>'id',gen_random_uuid()::text),
      'item_ids',to_jsonb(v.grade_boost_item_ids),'points',v.grade_boost_points,'group_points',v.group_grade_boost_points)) END;
  rank_sections:=CASE WHEN p_config ? 'rank_boost_sections' THEN v.rank_boost_sections ELSE
    jsonb_build_array(jsonb_build_object('id',COALESCE(old.rank_boost_sections->0->>'id',gen_random_uuid()::text),
      'item_ids',to_jsonb(v.rank_boost_item_ids),'points',v.rank_boost_points)) END;
  SELECT COALESCE(array_agg(DISTINCT item::uuid),'{}'::uuid[]) INTO grade_ids
    FROM jsonb_array_elements(grade_sections) s CROSS JOIN LATERAL jsonb_array_elements_text(s->'item_ids') item;
  SELECT COALESCE(array_agg(DISTINCT item::uuid),'{}'::uuid[]) INTO rank_ids
    FROM jsonb_array_elements(rank_sections) s CROSS JOIN LATERAL jsonb_array_elements_text(s->'item_ids') item;
  v.grade_boost_item_ids:=grade_ids; v.rank_boost_item_ids:=rank_ids;
  IF old.id IS NULL THEN
    INSERT INTO public.points_config(tenant_id,festival_id,rank_1_points,rank_2_points,rank_3_points,points_mode,
      grade_thresholds,point_brackets,group_point_brackets,separate_group_brackets,auto_bracket_selection,allow_bracket_override,
      less_than_3_teams_rule,rule12_min_teams,rule12_behavior,enable_grace_marks,grade_boost_points,group_grade_boost_points,
      rank_boost_points,grade_boost_item_ids,rank_boost_item_ids,grace_fields,grade_boost_enabled,rank_boost_enabled,
      member_brackets_enabled,grade_boost_sections,rank_boost_sections,config_version,change_reason)
    VALUES(owner,p_festival_id,v.rank_1_points,v.rank_2_points,v.rank_3_points,v.points_mode,v.grade_thresholds,v.point_brackets,
      v.group_point_brackets,v.separate_group_brackets,v.auto_bracket_selection,v.allow_bracket_override,v.less_than_3_teams_rule,
      v.rule12_min_teams,v.rule12_behavior,v.enable_grace_marks,v.grade_boost_points,v.group_grade_boost_points,v.rank_boost_points,
      v.grade_boost_item_ids,v.rank_boost_item_ids,v.grace_fields,COALESCE(v.grade_boost_enabled,true),COALESCE(v.rank_boost_enabled,true),
      COALESCE(v.member_brackets_enabled,true),grade_sections,rank_sections,1,p_reason) RETURNING * INTO v;
  ELSE
    UPDATE public.points_config SET rank_1_points=v.rank_1_points,rank_2_points=v.rank_2_points,rank_3_points=v.rank_3_points,
      points_mode=v.points_mode,grade_thresholds=v.grade_thresholds,point_brackets=v.point_brackets,group_point_brackets=v.group_point_brackets,
      separate_group_brackets=v.separate_group_brackets,auto_bracket_selection=v.auto_bracket_selection,allow_bracket_override=v.allow_bracket_override,
      less_than_3_teams_rule=v.less_than_3_teams_rule,rule12_min_teams=v.rule12_min_teams,rule12_behavior=v.rule12_behavior,
      enable_grace_marks=v.enable_grace_marks,grade_boost_points=v.grade_boost_points,group_grade_boost_points=v.group_grade_boost_points,
      rank_boost_points=v.rank_boost_points,grade_boost_item_ids=v.grade_boost_item_ids,rank_boost_item_ids=v.rank_boost_item_ids,
      grace_fields=v.grace_fields,grade_boost_sections=grade_sections,rank_boost_sections=rank_sections,
      grade_boost_enabled=COALESCE(v.grade_boost_enabled,old.grade_boost_enabled),rank_boost_enabled=COALESCE(v.rank_boost_enabled,old.rank_boost_enabled),
      member_brackets_enabled=COALESCE(v.member_brackets_enabled,old.member_brackets_enabled),config_version=old.config_version+1,
      change_reason=p_reason WHERE id=old.id RETURNING * INTO v;
  END IF;
  RETURN v;
END $function$;
ALTER FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.grace_teams(p_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE root uuid; n integer; BEGIN
  SELECT organisation_id INTO root FROM public.tenants WHERE id=p_tenant;
  IF root IS NULL THEN
    SELECT count(*) INTO n FROM public.organisations WHERE tenant_id=p_tenant;
    IF n<>1 THEN RAISE EXCEPTION 'Resolve the tenant organisation before assigning grace marks.'; END IF;
    SELECT id INTO root FROM public.organisations WHERE tenant_id=p_tenant;
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) ORDER BY o.name,o.id)
    FROM public.organisations o WHERE o.parent_id=root AND o.archived_at IS NULL),'[]');
END $function$;
ALTER FUNCTION "scoring_private"."grace_teams"(p_tenant uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_grace_workspace(p_festival_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE c public.points_config; w public.grace_workspaces; last_submit public.grace_submissions; BEGIN
  SELECT * INTO c FROM public.points_config WHERE festival_id=p_festival_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Configure points and grace fields first.'; END IF;
  PERFORM scoring_private.assert_admin(c.tenant_id);
  SELECT * INTO w FROM public.grace_workspaces WHERE festival_id=p_festival_id;
  SELECT * INTO last_submit FROM public.grace_submissions WHERE festival_id=p_festival_id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('config_version',c.config_version,'enabled',c.enable_grace_marks,'fields',c.grace_fields,
    'teams',scoring_private.grace_teams(c.tenant_id),'entries',COALESCE(w.entries,'{}'),'revision',COALESCE(w.revision,0),
    'draft_config_version',w.config_version,'last_submission',CASE WHEN last_submit.id IS NULL THEN NULL ELSE jsonb_build_object('id',last_submit.id,'revision',last_submit.revision,'config_version',last_submit.config_version,'created_at',last_submit.created_at) END);
END $function$;
ALTER FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.validate_grace(c points_config, teams jsonb, entries jsonb, complete boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE team jsonb; field jsonb; org text; key text; val jsonb; BEGIN
  IF c.enable_grace_marks IS NOT TRUE OR jsonb_array_length(c.grace_fields)=0 THEN RAISE EXCEPTION 'Configure and enable grace fields first.'; END IF;
  IF jsonb_typeof(entries) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid grace draft.'; END IF;
  FOR org IN SELECT jsonb_object_keys(entries) LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(teams) t WHERE t->>'id'=org) THEN RAISE EXCEPTION 'Draft includes a team outside this festival.'; END IF;
    IF jsonb_typeof(entries->org) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid team entries.'; END IF;
    FOR key IN SELECT jsonb_object_keys(entries->org) LOOP
      SELECT f INTO field FROM jsonb_array_elements(c.grace_fields) f WHERE f->>'id'=key;
      IF field IS NULL THEN RAISE EXCEPTION 'Draft contains an obsolete grace field. Reload and review.'; END IF;
      val:=entries->org->key;
      IF scoring_private.whole(val)>scoring_private.whole(field->'max_marks',true) THEN RAISE EXCEPTION 'Grace marks exceed configured maximum for %.',field->>'name'; END IF;
    END LOOP;
  END LOOP;
  IF complete THEN
    IF jsonb_array_length(teams)=0 THEN RAISE EXCEPTION 'No participating teams are configured.'; END IF;
    FOR team IN SELECT value FROM jsonb_array_elements(teams) LOOP
      FOR field IN SELECT value FROM jsonb_array_elements(c.grace_fields) LOOP
        IF NOT COALESCE((entries->(team->>'id')) ? (field->>'id'),false) THEN RAISE EXCEPTION 'Complete every grace field for every team before All Submit.'; END IF;
      END LOOP;
    END LOOP;
  END IF;
END $function$;
ALTER FUNCTION "scoring_private"."validate_grace"(c points_config, teams jsonb, entries jsonb, complete boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.save_grace_draft(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE c public.points_config; w public.grace_workspaces; teams jsonb; BEGIN
  SELECT * INTO c FROM public.points_config WHERE festival_id=p_festival_id FOR SHARE;
  PERFORM scoring_private.assert_admin(c.tenant_id);
  IF c.config_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Configuration changed. Reload grace fields.' USING ERRCODE='40001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('grace:'||p_festival_id::text,0));
  SELECT * INTO w FROM public.grace_workspaces WHERE festival_id=p_festival_id FOR UPDATE;
  IF COALESCE(w.revision,0) IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Grace draft changed in another session. Reload before saving.' USING ERRCODE='40001'; END IF;
  teams:=scoring_private.grace_teams(c.tenant_id);
  PERFORM scoring_private.validate_grace(c,teams,p_entries,false);
  INSERT INTO public.grace_workspaces(festival_id,tenant_id,config_version,revision,entries,updated_by)
    VALUES(p_festival_id,c.tenant_id,c.config_version,COALESCE(w.revision,0)+1,p_entries,auth.uid())
    ON CONFLICT(festival_id) DO UPDATE SET config_version=EXCLUDED.config_version,revision=EXCLUDED.revision,entries=EXCLUDED.entries,updated_by=EXCLUDED.updated_by,updated_at=now();
  RETURN public.get_grace_workspace(p_festival_id);
END $function$;
ALTER FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.submit_all_grace_marks(p_festival_id uuid, p_expected_version integer, p_expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE c public.points_config; w public.grace_workspaces; sub public.grace_submissions; teams jsonb; team jsonb; amount integer; BEGIN
  SELECT * INTO c FROM public.points_config WHERE festival_id=p_festival_id FOR SHARE;
  PERFORM scoring_private.assert_admin(c.tenant_id);
  IF c.config_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Configuration changed. Reload grace fields.' USING ERRCODE='40001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('grace:'||p_festival_id::text,0));
  SELECT * INTO w FROM public.grace_workspaces WHERE festival_id=p_festival_id FOR UPDATE;
  IF w.revision IS DISTINCT FROM p_expected_revision OR w.config_version IS DISTINCT FROM c.config_version THEN RAISE EXCEPTION 'Save and review the current draft before All Submit.' USING ERRCODE='40001'; END IF;
  -- Freeze the roster for this short finalization transaction, including concurrent additions.
  LOCK TABLE public.organisations IN SHARE MODE;
  teams:=scoring_private.grace_teams(c.tenant_id);
  PERFORM scoring_private.validate_grace(c,teams,w.entries,true);
  SELECT * INTO sub FROM public.grace_submissions WHERE festival_id=p_festival_id AND revision=w.revision AND config_version=c.config_version;
  IF sub.id IS NOT NULL THEN
    IF sub.teams_snapshot IS DISTINCT FROM teams THEN RAISE EXCEPTION 'Team list changed. Save and review the full draft again.'; END IF;
    RETURN jsonb_build_object('submission_id',sub.id);
  END IF;
  INSERT INTO public.grace_submissions(tenant_id,festival_id,config_version,revision,entries,fields_snapshot,teams_snapshot,previous_totals,created_by)
    VALUES(c.tenant_id,p_festival_id,c.config_version,w.revision,w.entries,c.grace_fields,teams,
      COALESCE((SELECT jsonb_agg(to_jsonb(old)) FROM public.grace_marks old WHERE old.festival_id=p_festival_id AND old.tenant_id=c.tenant_id),'[]'),auth.uid()) RETURNING * INTO sub;
  DELETE FROM public.grace_marks WHERE festival_id=p_festival_id AND tenant_id=c.tenant_id;
  FOR team IN SELECT value FROM jsonb_array_elements(teams) LOOP
    SELECT sum(value::text::integer)::integer INTO amount FROM jsonb_each(w.entries->(team->>'id'));
    INSERT INTO public.grace_marks(tenant_id,festival_id,org_id,points,submission_id,created_by,updated_by)
      VALUES(c.tenant_id,p_festival_id,(team->>'id')::uuid,amount,sub.id,auth.uid(),auth.uid());
  END LOOP;
  RETURN jsonb_build_object('submission_id',sub.id);
END $function$;
ALTER FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.single_competition_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN
  IF NEW.festival_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.category_codes IS DISTINCT FROM OLD.category_codes) THEN
    IF cardinality(NEW.category_codes) IS DISTINCT FROM 1 OR nullif(btrim(NEW.category_codes[1]),'') IS NULL THEN RAISE EXCEPTION 'Create a separate competition for each category.'; END IF;
  END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION "scoring_private"."single_competition_category"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_judge_scoring_context(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE t public.judge_tokens; c public.points_config; BEGIN
  SELECT * INTO t FROM public.judge_tokens WHERE (token=upper(btrim(p_token)) OR token_hash=encode(extensions.digest(upper(btrim(p_token)),'sha256'),'hex'))
    AND status='approved' AND is_used=false AND is_revoked IS NOT TRUE AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 1;
  IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.schedule_judge_assignments a WHERE a.schedule_id=t.schedule_id AND a.judge_id=t.judge_id AND a.tenant_id=t.tenant_id AND a.status='active') THEN RAISE EXCEPTION 'Invalid or inactive judge access code.' USING ERRCODE='42501'; END IF;
  SELECT pc.* INTO c FROM public.points_config pc JOIN public.schedules s ON s.festival_id=pc.festival_id AND s.tenant_id=pc.tenant_id WHERE s.id=t.schedule_id;
  IF c.id IS NULL THEN RETURN jsonb_build_object('configured',false); END IF;
  RETURN jsonb_build_object('configured',true,'config_version',c.config_version,'grade_thresholds',c.grade_thresholds);
END $function$;
ALTER FUNCTION "public"."get_judge_scoring_context"(p_token text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.save_competition_items(p_festival_id uuid, p_codes text[], p_records jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE owner uuid; code text; rec jsonb; BEGIN
  SELECT tenant_id INTO owner FROM public.festival_calendar WHERE id=p_festival_id;
  PERFORM scoring_private.assert_admin(owner);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text,0));
  IF p_codes IS NULL OR (SELECT count(DISTINCT c) FROM unnest(p_codes) c)<>cardinality(p_codes)
    THEN RAISE EXCEPTION 'Competition selections must be unique.'; END IF;
  UPDATE public.items SET is_active=item_code=ANY(p_codes) WHERE festival_id=p_festival_id AND tenant_id=owner;
  FOREACH code IN ARRAY p_codes LOOP
    IF EXISTS(SELECT 1 FROM public.items WHERE festival_id=p_festival_id AND item_code=code AND tenant_id=owner) THEN CONTINUE; END IF;
    SELECT value INTO rec FROM jsonb_array_elements(p_records) WHERE value->>'item_code'=code LIMIT 1;
    IF rec IS NULL OR nullif(btrim(rec->>'item_name_ml'),'') IS NULL OR jsonb_array_length(rec->'category_codes')<>1
      THEN RAISE EXCEPTION 'A complete single-category competition is required.'; END IF;
    INSERT INTO public.items(tenant_id,festival_id,item_code,item_name_ml,item_name_en,category_codes,
      participation_type,source,is_active,duration_minutes,group_min_members,group_max_members)
      VALUES(owner,p_festival_id,code,rec->>'item_name_ml',COALESCE(rec->>'item_name_en',rec->>'item_name_ml'),
        ARRAY(SELECT jsonb_array_elements_text(rec->'category_codes')),rec->>'participation_type',
        COALESCE(rec->>'source','custom'),true,(rec->>'duration_minutes')::integer,
        (rec->>'group_min_members')::integer,(rec->>'group_max_members')::integer);
  END LOOP;
END $function$;
ALTER FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.check_item_scoring_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE check_size boolean; BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.festival_id::text,0));
  IF TG_OP='INSERT' THEN check_size:=true;
  ELSE check_size:=NEW.source IS DISTINCT FROM OLD.source OR NEW.participation_type IS DISTINCT FROM OLD.participation_type
    OR NEW.group_min_members IS DISTINCT FROM OLD.group_min_members OR NEW.group_max_members IS DISTINCT FROM OLD.group_max_members;
  END IF;
  IF check_size AND NEW.source='custom' AND NEW.participation_type='group' AND
    (NEW.group_min_members IS NULL OR NEW.group_max_members IS NULL OR NEW.group_min_members<1
      OR NEW.group_max_members<>NEW.group_min_members)
    THEN RAISE EXCEPTION 'A new custom group competition requires an exact positive member count.'; END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION "scoring_private"."check_item_scoring_contract"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.create_general_team_entry(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor public.profiles; v_owner uuid; v_org uuid;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  SELECT tenant_id INTO v_owner FROM public.festival_calendar WHERE id=p_festival_id;
  IF v_actor.id IS NULL OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE)
    OR v_owner IS NULL OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.tenant_id IS DISTINCT FROM v_owner) THEN
    RAISE EXCEPTION 'Administrator access to this festival is required.' USING ERRCODE='42501';
  END IF;
  SELECT organisation_id INTO v_org FROM public.participants WHERE id=p_participant_ids[1] AND festival_id=p_festival_id;
  IF v_org IS NULL OR (v_actor.is_superadmin IS NOT TRUE AND NOT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(v_actor.tenant_id) o WHERE o.id=v_org)) THEN
    RAISE EXCEPTION 'This team is outside your organisation scope.' USING ERRCODE='42501';
  END IF;
  RETURN group_entry_private.create_entry(p_festival_id,p_item_id,v_org,p_participant_ids);
END $function$;
ALTER FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_participant_general_results(p_participant_id uuid)
 RETURNS TABLE(registration_id uuid, item_id uuid, item_code text, item_name_en text, item_name_ml text, entry_chest_number text, rank integer, grade text, published_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_participant public.participants%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_participant FROM public.participants WHERE id = p_participant_id;
  IF NOT FOUND OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Participant or administrator access was not found.' USING ERRCODE = '42501';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND (
    v_actor.tenant_id IS DISTINCT FROM public.get_my_tenant_id()
    OR NOT EXISTS (
      SELECT 1 FROM public.get_visible_organisations(v_actor.tenant_id) visible
      WHERE visible.id = v_participant.organisation_id
    )
  ) THEN
    RAISE EXCEPTION 'Participant is outside your tenant.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, i.id, i.item_code, i.item_name_en, i.item_name_ml,
         group_entry_private.chest_number(r), res.rank, res.grade, res.published_at
  FROM public.group_members gm
  JOIN public.registrations r ON r.id = gm.registration_id AND r.entry_kind = 'general_team'
  JOIN public.items i ON i.id = r.item_id
  LEFT JOIN public.results res ON res.registration_id = r.id AND res.published IS TRUE
  WHERE gm.participant_id = p_participant_id
    AND r.festival_id = v_participant.festival_id
    AND (v_actor.is_superadmin IS TRUE OR r.tenant_id = v_actor.tenant_id OR r.organisation_id IN (
      SELECT visible.id FROM public.get_visible_organisations(v_actor.tenant_id) visible
    ))
  ORDER BY res.published_at DESC NULLS LAST, i.item_name_en;
END;
$function$;
ALTER FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.enforce_festival_participant_gender()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_gender_mode text;
  v_gender text := lower(btrim(coalesce(NEW.gender, '')));
BEGIN
  IF NEW.festival_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT fc.gender_mode
    INTO v_gender_mode
    FROM public.festival_calendar AS fc
   WHERE fc.id = NEW.festival_id;

  -- Let the existing festival/category validation report a missing festival.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_gender_mode = 'boys_only' THEN
    IF v_gender = '' THEN
      NEW.gender := 'boys';
    ELSIF v_gender <> 'boys' THEN
      RAISE EXCEPTION 'This festival is configured for boys only.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_gender_mode = 'girls_only' THEN
    IF v_gender = '' THEN
      NEW.gender := 'girls';
    ELSIF v_gender <> 'girls' THEN
      RAISE EXCEPTION 'This festival is configured for girls only.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."enforce_festival_participant_gender"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.create_participant_with_chest_number(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_festival_tenant uuid;
  v_organisation_tenant uuid;
  v_template text;
  v_range integer;
  v_position integer;
  v_ordinal integer;
  v_candidate text;
  v_constraint_name text;
  v_participant public.participants%ROWTYPE;
BEGIN
  IF p_festival_id IS NULL OR p_category_code IS NULL OR pg_catalog.btrim(p_category_code) = '' THEN
    RAISE EXCEPTION 'Festival and category are required to create a participant.';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  -- Lock before reading the template so a concurrent settings save cannot
  -- leave this request using the previous numbering mode.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT tenant_id, chest_number_category_range, chest_number_template
    INTO v_festival_tenant, v_range, v_template
  FROM public.festival_calendar WHERE id = p_festival_id;
  IF NOT FOUND OR v_actor.id IS NULL THEN RAISE EXCEPTION 'Festival not found or authentication is required.'; END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND
     (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can create participants.';
  END IF;
  SELECT tenant_id INTO v_organisation_tenant FROM public.organisations WHERE id = p_organisation_id;
  IF NOT FOUND OR v_organisation_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'Participant organisation does not match its tenant.';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND NOT public.is_org_visible(p_organisation_id) THEN
    RAISE EXCEPTION 'You cannot create participants in this organisation.';
  END IF;

  IF v_template = 'team' THEN
    v_position := public.festival_team_chest_slot(p_festival_id, p_organisation_id);
  ELSE
    WITH category_codes AS (
      SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code
      FROM public.festival_categories fc
      WHERE fc.festival_id = p_festival_id AND pg_catalog.btrim(COALESCE(fc.code, '')) <> ''
      UNION
      SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(p.category_code))
      FROM public.participants p
      WHERE p.festival_id = p_festival_id AND pg_catalog.btrim(COALESCE(p.category_code, '')) <> ''
      UNION SELECT pg_catalog.lower(pg_catalog.btrim(p_category_code))
    ), ordered_categories AS (
      SELECT codes.category_code,
        row_number() OVER (ORDER BY fc.sort_order NULLS LAST, codes.category_code) AS position
      FROM category_codes codes
      LEFT JOIN LATERAL (
        SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
        WHERE fc.festival_id = p_festival_id AND pg_catalog.lower(pg_catalog.btrim(fc.code)) = codes.category_code
      ) fc ON true
    )
    SELECT position INTO v_position FROM ordered_categories
    WHERE category_code = pg_catalog.lower(pg_catalog.btrim(p_category_code));
    IF v_position IS NULL THEN RAISE EXCEPTION 'Unable to resolve the participant category position.'; END IF;
  END IF;

  FOR v_ordinal IN 1..v_range LOOP
    v_candidate := ((v_position * v_range) + v_ordinal - 1)::text;
    BEGIN
      INSERT INTO public.participants (
        tenant_id, festival_id, organisation_id, name, category_code, chest_number,
        status, age, class_std, dob, gender, public_profile_enabled, show_organisation_public
      ) VALUES (
        p_tenant_id, p_festival_id, p_organisation_id, p_name, p_category_code, v_candidate,
        p_status, p_age, NULLIF(pg_catalog.btrim(p_class_std), '')::integer, p_dob, p_gender,
        p_public_profile_enabled, p_show_organisation_public
      ) RETURNING * INTO v_participant;
      RETURN to_jsonb(v_participant);
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IS DISTINCT FROM 'unique_active_chest_number' THEN RAISE; END IF;
    END;
  END LOOP;
  IF v_template = 'team' THEN
    RAISE EXCEPTION 'Team chest-number capacity (%) reached.', v_range;
  END IF;
  RAISE EXCEPTION 'Category capacity (%) reached. Change the festival range to Under 1000.', v_range;
END;
$function$;
ALTER FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.set_program_intake_status(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean)
 RETURNS program_intake_statuses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_festival public.festival_calendar%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_result public.program_intake_statuses%ROWTYPE;
  v_category text := upper(btrim(p_category_code));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_festival FROM public.festival_calendar WHERE id = p_festival_id;
  IF NOT FOUND OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.tenant_id IS DISTINCT FROM v_festival.tenant_id) THEN
    RAISE EXCEPTION 'Festival is outside your organisation scope.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_item FROM public.items
  WHERE id = p_item_id AND festival_id = p_festival_id AND tenant_id = v_festival.tenant_id;
  IF NOT FOUND OR v_item.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Select an active competition from this festival.';
  END IF;

  IF p_entry_kind IS NULL OR p_entry_kind NOT IN ('participant', 'general_team') OR v_category IS NULL OR v_category = '' THEN
    RAISE EXCEPTION 'A valid competition category and entry type are required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(v_item.category_codes, ARRAY[]::text[])) code
    WHERE upper(btrim(code)) = v_category
  ) THEN
    RAISE EXCEPTION 'The category does not belong to this competition.';
  END IF;
  IF p_entry_kind = 'general_team'
     AND v_item.participation_type IS DISTINCT FROM 'group' THEN
    RAISE EXCEPTION 'General entries require an active General group competition.';
  END IF;
  IF v_category IN ('GN', 'GENERAL') AND v_festival.general_category_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'General entries are disabled for this festival.';
  END IF;
  IF p_entry_kind = 'participant' AND v_category IN ('GN', 'GENERAL') THEN
    RAISE EXCEPTION 'General competitions are completed through team entries.';
  END IF;

  INSERT INTO public.program_intake_statuses (
    tenant_id, festival_id, item_id, category_code, entry_kind,
    is_complete, completed_at, completed_by, updated_at
  ) VALUES (
    v_festival.tenant_id, p_festival_id, p_item_id, v_category, p_entry_kind,
    p_is_complete,
    CASE WHEN p_is_complete THEN now() ELSE NULL END,
    CASE WHEN p_is_complete THEN auth.uid() ELSE NULL END,
    now()
  )
  ON CONFLICT (festival_id, item_id, category_code, entry_kind)
  DO UPDATE SET
    is_complete = EXCLUDED.is_complete,
    completed_at = EXCLUDED.completed_at,
    completed_by = EXCLUDED.completed_by,
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;
ALTER FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.reopen_program_intake_on_registration_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_festival_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.festival_id ELSE NEW.festival_id END;
  v_item_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.item_id ELSE NEW.item_id END;
  v_entry_kind text := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_kind ELSE NEW.entry_kind END;
  v_participant_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.participant_id ELSE NEW.participant_id END;
  v_tenant_id uuid;
  v_category text;
  v_participant_category text;
  v_kind text;
BEGIN
  IF v_entry_kind = 'general_team' OR EXISTS (SELECT 1 FROM public.items i WHERE i.id=v_item_id AND i.participation_type='group') THEN
    SELECT upper(btrim(i.category_codes[1])) INTO v_category FROM public.items i WHERE i.id=v_item_id;
    v_kind := 'general_team';
  ELSIF v_participant_id IS NOT NULL THEN
    SELECT upper(btrim(category_code)) INTO v_participant_category
    FROM public.participants WHERE id = v_participant_id;
    SELECT upper(btrim(category_code)) INTO v_category
    FROM public.items item
    CROSS JOIN LATERAL unnest(COALESCE(item.category_codes, ARRAY[]::text[])) AS categories(category_code)
    WHERE item.id = v_item_id
      AND (
        upper(btrim(categories.category_code)) = v_participant_category
        OR (upper(btrim(categories.category_code)) = 'JR' AND v_participant_category = 'JUNIOR')
        OR (upper(btrim(categories.category_code)) = 'JUNIOR' AND v_participant_category = 'JR')
        OR (upper(btrim(categories.category_code)) = 'SR' AND v_participant_category = 'SENIOR')
        OR (upper(btrim(categories.category_code)) = 'SENIOR' AND v_participant_category = 'SR')
        OR (upper(btrim(categories.category_code)) = 'CA' AND v_participant_category = 'CAMPUS')
        OR (upper(btrim(categories.category_code)) = 'CAMPUS' AND v_participant_category = 'CA')
      )
    LIMIT 1;

    IF v_category IS NULL THEN
      SELECT upper(btrim(c.code)) INTO v_category FROM public.items i
        CROSS JOIN LATERAL unnest(i.category_codes) c(code)
        WHERE i.id=v_item_id AND upper(btrim(c.code)) IN ('GN','GENERAL') LIMIT 1;
    END IF;
    v_kind := 'participant';
  ELSE
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.festival_calendar WHERE id = v_festival_id;
  IF v_tenant_id IS NOT NULL AND v_category IS NOT NULL
     AND v_category <> '' THEN
    INSERT INTO public.program_intake_statuses (
      tenant_id, festival_id, item_id, category_code, entry_kind,
      is_complete, completed_at, completed_by, updated_at
    ) VALUES (v_tenant_id, v_festival_id, v_item_id, v_category, v_kind, false, NULL, NULL, now())
    ON CONFLICT (festival_id, item_id, category_code, entry_kind)
    DO UPDATE SET is_complete = false, completed_at = NULL, completed_by = NULL, updated_at = now();
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;
ALTER FUNCTION "public"."reopen_program_intake_on_registration_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.apply_competition_item_changes(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE
  owner uuid;
  code text;
  rec jsonb;
BEGIN
  SELECT tenant_id INTO owner
  FROM public.festival_calendar
  WHERE id = p_festival_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'Festival not found.';
  END IF;
  PERFORM scoring_private.assert_admin(owner);

  IF p_activate_codes IS NULL OR p_deactivate_codes IS NULL
     OR COALESCE(jsonb_typeof(p_records), '') <> 'array'
     OR (SELECT count(DISTINCT c) FROM unnest(p_activate_codes) AS c) <> cardinality(p_activate_codes)
     OR (SELECT count(DISTINCT c) FROM unnest(p_deactivate_codes) AS c) <> cardinality(p_deactivate_codes)
     OR EXISTS (SELECT 1 FROM unnest(p_activate_codes || p_deactivate_codes) AS c WHERE c IS NULL OR btrim(c) = '')
     OR p_activate_codes && p_deactivate_codes
  THEN
    RAISE EXCEPTION 'Invalid competition item changes.';
  END IF;

  -- The legacy save RPC uses this same festival lock. Once acquired, every
  -- update below runs atomically against the latest committed item state.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text, 0));

  UPDATE public.items
  SET is_active = false
  WHERE festival_id = p_festival_id AND tenant_id = owner
    AND item_code = ANY(p_deactivate_codes) AND is_active;

  UPDATE public.items
  SET is_active = true
  WHERE festival_id = p_festival_id AND tenant_id = owner
    AND item_code = ANY(p_activate_codes) AND NOT is_active;

  FOREACH code IN ARRAY p_activate_codes LOOP
    IF EXISTS (
      SELECT 1 FROM public.items
      WHERE festival_id = p_festival_id AND tenant_id = owner AND item_code = code
    ) THEN
      CONTINUE;
    END IF;

    SELECT value INTO rec
    FROM jsonb_array_elements(p_records)
    WHERE value->>'item_code' = code
    LIMIT 1;
    IF rec IS NULL OR nullif(btrim(rec->>'item_name_ml'), '') IS NULL
       OR COALESCE(jsonb_typeof(rec->'category_codes'), '') <> 'array'
    THEN
      RAISE EXCEPTION 'A complete single-category competition is required.';
    END IF;
    IF jsonb_array_length(rec->'category_codes') <> 1 THEN
      RAISE EXCEPTION 'A complete single-category competition is required.';
    END IF;

    INSERT INTO public.items (
      tenant_id, festival_id, item_code, item_name_ml, item_name_en,
      category_codes, participation_type, source, is_active,
      duration_minutes, group_min_members, group_max_members
    ) VALUES (
      owner, p_festival_id, code, rec->>'item_name_ml',
      COALESCE(rec->>'item_name_en', rec->>'item_name_ml'),
      ARRAY(SELECT jsonb_array_elements_text(rec->'category_codes')),
      rec->>'participation_type', COALESCE(rec->>'source', 'custom'), true,
      (rec->>'duration_minutes')::integer,
      (rec->>'group_min_members')::integer,
      (rec->>'group_max_members')::integer
    );
  END LOOP;
END;
$function$;
ALTER FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.delete_archived_organisation(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_name text;
  v_archived_at timestamptz;
BEGIN
  PERFORM public._assert_organisation_hierarchy_access(p_org_id);

  SELECT o.tenant_id, o.name, o.archived_at
    INTO v_tenant_id, v_name, v_archived_at
  FROM public.organisations o
  WHERE o.id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organisation not found';
  END IF;

  IF v_archived_at IS NULL THEN
    RAISE EXCEPTION 'Only archived organisations can be permanently deleted';
  END IF;

  IF EXISTS (SELECT 1 FROM public.organisations WHERE parent_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.tenants WHERE organisation_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.participants WHERE organisation_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.registrations WHERE organisation_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.festival_teams WHERE organisation_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.grace_marks WHERE org_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.participant_unit_batches WHERE target_unit_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.participant_unit_audit_logs WHERE old_unit_id = p_org_id)
     OR EXISTS (SELECT 1 FROM public.participant_unit_audit_logs WHERE new_unit_id = p_org_id)
  THEN
    RAISE EXCEPTION 'Cannot permanently delete this organisation: child organisations or linked tenant, participant, registration, team, or grace-mark records still exist. Reactivate it if needed; existing history was preserved.';
  END IF;

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(),
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_tenant_id,
    p_org_id,
    'organisation_permanently_deleted',
    'Deleted from archived organisation management',
    jsonb_build_object('name', v_name, 'archived_at', v_archived_at),
    NULL,
    true
  );

  DELETE FROM public.organisations WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'org_id', p_org_id,
    'state', 'deleted',
    'message', 'Archived organisation permanently deleted.'
  );
END;
$function$;
ALTER FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.ensure_festival_team_chest_slots(p_festival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_root_id uuid; v_last_slot integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT t.organisation_id INTO v_root_id
  FROM public.festival_calendar f JOIN public.tenants t ON t.id = f.tenant_id
  WHERE f.id = p_festival_id;
  IF v_root_id IS NULL THEN RAISE EXCEPTION 'Festival owner organisation is missing.'; END IF;
  SELECT COALESCE(max(slot_number), 0) INTO v_last_slot
  FROM public.festival_team_chest_slots WHERE festival_id = p_festival_id;
  INSERT INTO public.festival_team_chest_slots(festival_id, organisation_id, slot_number)
  SELECT p_festival_id, o.id, v_last_slot + row_number() OVER (ORDER BY o.created_at, o.id)
  FROM public.organisations o
  WHERE o.parent_id = v_root_id
    AND NOT EXISTS (SELECT 1 FROM public.festival_team_chest_slots s WHERE s.festival_id = p_festival_id AND s.organisation_id = o.id);
END;
$function$;
ALTER FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.festival_team_chest_slot(p_festival_id uuid, p_organisation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_slot integer;
BEGIN
  SELECT slot_number INTO v_slot FROM public.festival_team_chest_slots
  WHERE festival_id = p_festival_id AND organisation_id = p_organisation_id;
  IF v_slot IS NULL THEN
    PERFORM public.ensure_festival_team_chest_slots(p_festival_id);
    SELECT slot_number INTO v_slot FROM public.festival_team_chest_slots
    WHERE festival_id = p_festival_id AND organisation_id = p_organisation_id;
  END IF;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'Select a team directly under this festival organisation.'; END IF;
  RETURN v_slot;
END;
$function$;
ALTER FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.validate_team_chest_number_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_range integer; v_slot integer; v_template text;
BEGIN
  -- Serialize direct inserts with a template switch before reading the mode.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(NEW.festival_id::text), pg_catalog.hashtext('participant-chest-number'));
  SELECT chest_number_template, chest_number_category_range
  INTO v_template, v_range FROM public.festival_calendar WHERE id = NEW.festival_id;
  IF v_template IS DISTINCT FROM 'team' THEN RETURN NEW; END IF;
  IF NEW.organisation_id IS NULL OR NEW.tenant_id IS DISTINCT FROM
     (SELECT tenant_id FROM public.organisations WHERE id = NEW.organisation_id) THEN
    RAISE EXCEPTION 'Select a valid team before creating a participant.';
  END IF;
  v_slot := public.festival_team_chest_slot(NEW.festival_id, NEW.organisation_id);
  IF NEW.chest_number IS NULL OR NEW.chest_number !~ '^[0-9]+$' OR
     NEW.chest_number::numeric < v_slot * v_range OR
     NEW.chest_number::numeric >= (v_slot + 1) * v_range THEN
    RAISE EXCEPTION 'The participant chest number must be allocated from the selected team range.';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."validate_team_chest_number_on_insert"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.sync_festival_chest_numbers_on_settings_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.chest_number_template = 'team' THEN
      PERFORM public.ensure_festival_team_chest_slots(NEW.id);
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.chest_number_template IS DISTINCT FROM NEW.chest_number_template OR
     OLD.chest_number_category_range IS DISTINCT FROM NEW.chest_number_category_range THEN
    -- The regeneration function takes the same festival-scoped advisory lock
    -- as participant creation, then reads the just-updated calendar row.
    PERFORM public.regenerate_festival_chest_numbers_internal(NEW.id, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.renumber_participant_on_team_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_template text; v_range integer; v_slot integer; v_ordinal integer; v_candidate text;
BEGIN
  IF OLD.festival_id IS DISTINCT FROM NEW.festival_id THEN
    RAISE EXCEPTION 'Team transfer cannot change the participant festival.';
  END IF;
  SELECT f.chest_number_template, f.chest_number_category_range
  INTO v_template, v_range FROM public.festival_calendar f WHERE f.id = NEW.festival_id;
  IF v_template IS DISTINCT FROM 'team' THEN RETURN NEW; END IF;
  IF NEW.organisation_id IS NULL THEN RAISE EXCEPTION 'Team-based chest numbers require a team.'; END IF;
  IF NEW.tenant_id IS DISTINCT FROM (SELECT tenant_id FROM public.organisations WHERE id = NEW.organisation_id) THEN
    RAISE EXCEPTION 'Participant tenant must match the destination team.';
  END IF;
  v_slot := public.festival_team_chest_slot(NEW.festival_id, NEW.organisation_id);
  FOR v_ordinal IN 1..v_range LOOP
    v_candidate := ((v_slot * v_range) + v_ordinal - 1)::text;
    IF v_candidate IS DISTINCT FROM OLD.chest_number
       AND NOT EXISTS (SELECT 1 FROM public.participants p
                   WHERE p.festival_id = NEW.festival_id AND p.chest_number = v_candidate AND p.id <> NEW.id) THEN
      NEW.chest_number := v_candidate;
      RETURN NEW;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Team chest-number capacity (%) reached.', v_range;
END;
$function$;
ALTER FUNCTION "public"."renumber_participant_on_team_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.audit_participant_chest_number_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_festival_tenant uuid;
BEGIN
  IF OLD.chest_number IS DISTINCT FROM NEW.chest_number
     AND pg_catalog.left(COALESCE(OLD.chest_number, ''), 9) <> '__regen__'
     AND pg_catalog.left(COALESCE(NEW.chest_number, ''), 9) <> '__regen__' THEN
    SELECT tenant_id INTO v_festival_tenant FROM public.festival_calendar WHERE id = NEW.festival_id;
    INSERT INTO public.participant_chest_number_changes
      (tenant_id, festival_id, participant_id, old_chest_number, new_chest_number,
       old_organisation_id, new_organisation_id, changed_by)
    VALUES (v_festival_tenant, NEW.festival_id, NEW.id, OLD.chest_number, NEW.chest_number,
            OLD.organisation_id, NEW.organisation_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "public"."audit_participant_chest_number_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_next_festival_chest_number(p_festival_id uuid, p_category_code text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_template text; v_festival_tenant uuid; v_actor public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  SELECT chest_number_template, tenant_id INTO v_template, v_festival_tenant
  FROM public.festival_calendar WHERE id = p_festival_id;
  IF v_actor.id IS NULL OR v_festival_tenant IS NULL THEN
    RAISE EXCEPTION 'Festival not found or authentication is required.';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND
     (v_actor.role IS DISTINCT FROM 'admin' OR v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'Only the owning tenant admin can generate chest numbers.';
  END IF;
  IF v_template = 'team' THEN
    RAISE EXCEPTION 'Team chest numbers require a team; use participant creation to reserve one.';
  END IF;
  RETURN public.get_next_festival_category_chest_number(p_festival_id, p_category_code);
END;
$function$;
ALTER FUNCTION "public"."get_next_festival_chest_number"(p_festival_id uuid, p_category_code text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.assert_legacy_chest_import_allowed(p_tenant_id uuid, p_festival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);
  IF EXISTS (
    SELECT 1 FROM public.festival_calendar f
    WHERE f.id = p_festival_id AND f.chest_number_template = 'team'
  ) THEN
    RAISE EXCEPTION 'Legacy chest-number JSON import is unavailable for the team template. Add participants normally.';
  END IF;
END;
$function$;
ALTER FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.execute_junior_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_junior_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$function$;
ALTER FUNCTION "public"."execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.execute_senior_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_senior_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$function$;
ALTER FUNCTION "public"."execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.execute_upper_primary_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_upper_primary_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$function$;
ALTER FUNCTION "public"."execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.execute_lp_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_lp_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$function$;
ALTER FUNCTION "public"."execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.execute_hs_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_hs_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$function$;
ALTER FUNCTION "public"."execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.execute_hss_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_hss_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$function$;
ALTER FUNCTION "public"."execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.execute_general_import_chunk(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_legacy_chest_import_allowed(p_tenant_id, p_festival_id);
  RETURN public._legacy_execute_general_import_chunk(p_tenant_id, p_festival_id, p_session_id, p_participants);
END;
$function$;
ALTER FUNCTION "public"."execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION stage_portal_private.generate_venue_pin(p_venue_id uuid, p_tenant_id uuid, p_festival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_pin text;
  v_random bytea;
  v_try integer := 0;
BEGIN
  WHILE v_try < 100 LOOP
    v_try := v_try + 1;
    v_random := extensions.gen_random_bytes(2);
    v_pin := lpad(((pg_catalog.get_byte(v_random, 0) * 256 + pg_catalog.get_byte(v_random, 1)) % 10000)::text, 4, '0');
    BEGIN
      INSERT INTO stage_portal_private.venue_access_codes (venue_id, tenant_id, festival_id, pin)
      VALUES (p_venue_id, p_tenant_id, p_festival_id, v_pin)
      ON CONFLICT (venue_id) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            festival_id = EXCLUDED.festival_id,
            pin = EXCLUDED.pin,
            created_at = pg_catalog.now();
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not allocate a unique stage PIN for this festival.';
END;
$function$;
ALTER FUNCTION "stage_portal_private"."generate_venue_pin"(p_venue_id uuid, p_tenant_id uuid, p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION stage_portal_private.ensure_venue_pin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.id IS NULL OR NEW.tenant_id IS NULL OR NEW.festival_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.tenant_id = NEW.tenant_id AND OLD.festival_id = NEW.festival_id
     AND EXISTS (SELECT 1 FROM stage_portal_private.venue_access_codes c WHERE c.venue_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  PERFORM stage_portal_private.generate_venue_pin(NEW.id, NEW.tenant_id, NEW.festival_id);
  RETURN NEW;
END;
$function$;
ALTER FUNCTION "stage_portal_private"."ensure_venue_pin"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION stage_portal_private.assert_pin(p_venue_id uuid, p_pin text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_code stage_portal_private.venue_access_codes%ROWTYPE;
  v_headers jsonb;
  v_attempt_key text;
  v_attempt stage_portal_private.pin_attempts%ROWTYPE;
BEGIN
  IF p_venue_id IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RETURN 'Invalid stage link or PIN.';
  END IF;

  v_headers := COALESCE(NULLIF(pg_catalog.current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_attempt_key := pg_catalog.md5(COALESCE(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    v_headers ->> 'x-forwarded-for',
    'unknown'
  ));

  SELECT * INTO v_attempt
  FROM stage_portal_private.pin_attempts a
  WHERE a.venue_id = p_venue_id AND a.attempt_key = v_attempt_key;
  IF FOUND AND v_attempt.locked_until > pg_catalog.now() THEN
    RETURN 'Too many incorrect PIN attempts. Please wait before trying again.';
  END IF;

  SELECT * INTO v_code FROM stage_portal_private.venue_access_codes c
  WHERE c.venue_id = p_venue_id;
  IF NOT FOUND OR v_code.pin <> p_pin THEN
    INSERT INTO stage_portal_private.pin_attempts (venue_id, attempt_key, attempts, window_started_at, locked_until)
    VALUES (p_venue_id, v_attempt_key, 1, pg_catalog.now(), NULL)
    ON CONFLICT (venue_id, attempt_key) DO UPDATE SET
      attempts = CASE WHEN stage_portal_private.pin_attempts.window_started_at < pg_catalog.now() - interval '10 minutes'
        THEN 1 ELSE stage_portal_private.pin_attempts.attempts + 1 END,
      window_started_at = CASE WHEN stage_portal_private.pin_attempts.window_started_at < pg_catalog.now() - interval '10 minutes'
        THEN pg_catalog.now() ELSE stage_portal_private.pin_attempts.window_started_at END,
      locked_until = CASE WHEN stage_portal_private.pin_attempts.window_started_at < pg_catalog.now() - interval '10 minutes'
        THEN NULL WHEN stage_portal_private.pin_attempts.attempts + 1 >= 8
        THEN pg_catalog.now() + interval '5 minutes' ELSE NULL END;
    RETURN 'Incorrect PIN.';
  END IF;

  DELETE FROM stage_portal_private.pin_attempts a
  WHERE a.venue_id = p_venue_id AND a.attempt_key = v_attempt_key;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION "stage_portal_private"."assert_pin"(p_venue_id uuid, p_pin text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_stage_management_venue_codes(p_festival_id uuid)
 RETURNS TABLE(venue_id uuid, pin text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  IF NOT EXISTS (
    SELECT 1 FROM public.festival_calendar f
    WHERE f.id = p_festival_id AND f.tenant_id = v_tenant_id AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id, c.pin
  FROM public.venues v
  JOIN stage_portal_private.venue_access_codes c ON c.venue_id = v.id
  WHERE v.tenant_id = v_tenant_id AND v.festival_id = p_festival_id
  ORDER BY v.name, v.id;
END;
$function$;
ALTER FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.stage_venue_portal_data(p_venue_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedules jsonb;
  v_registrations jsonb;
  v_pin_error text;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN jsonb_build_object('error', v_pin_error); END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage not found.' USING ERRCODE = 'P0002'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'tenant_id', s.tenant_id, 'festival_id', s.festival_id, 'item_id', s.item_id,
    'venue_id', s.venue_id, 'start_time', s.start_time, 'end_time', s.end_time, 'status', s.status,
    'is_shuffle_locked', COALESCE(s.is_shuffle_locked, false), 'shuffle_locked_at', s.shuffle_locked_at,
    'item_code', i.item_code, 'item_name_en', i.item_name_en, 'item_name_ml', i.item_name_ml,
    'category_codes', i.category_codes, 'venue_name', v_venue.name,
    'registration_scope_ambiguous', (SELECT count(*) > 1 FROM public.schedules same_item
      WHERE same_item.tenant_id = s.tenant_id AND same_item.festival_id = s.festival_id AND same_item.item_id = s.item_id)
  ) ORDER BY s.start_time NULLS LAST, s.id), '[]'::jsonb)
  INTO v_schedules
  FROM public.schedules s
  JOIN public.items i ON i.id = s.item_id AND i.tenant_id = v_venue.tenant_id AND i.festival_id = v_venue.festival_id
  WHERE s.venue_id = p_venue_id AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'schedule_id', s.id, 'item_id', r.item_id, 'participant_id', r.participant_id,
    'organisation_id', COALESCE(r.organisation_id, p.organisation_id), 'status', r.status,
    'is_verified', r.is_verified, 'code_letter', r.code_letter,
    'participant_name', CASE WHEN r.entry_kind = 'general_team' THEN group_entry_private.display_name(r) ELSE p.name END,
    'participant_chest_number', COALESCE(group_entry_private.chest_number(r), p.chest_number),
    'participant_category_code', CASE WHEN r.entry_kind = 'general_team' THEN group_entry_private.category_code(r) ELSE p.category_code END,
    'organisation_name', o.name, 'organisation_type', o.org_type,
    'entry_kind', r.entry_kind,
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', gp.name, 'chest_number', gp.chest_number)
      ORDER BY gp.chest_number NULLS LAST, gp.name)
      FROM public.group_members gm JOIN public.participants gp ON gp.id = gm.participant_id
      WHERE gm.registration_id = r.id), '[]'::jsonb)
  ) ORDER BY COALESCE(group_entry_private.chest_number(r), p.chest_number) NULLS LAST, p.name, r.id), '[]'::jsonb)
  INTO v_registrations
  FROM public.schedules s
  JOIN public.registrations r ON r.item_id = s.item_id AND r.festival_id = s.festival_id
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_venue.festival_id
  LEFT JOIN public.organisations o ON o.id = COALESCE(r.organisation_id, p.organisation_id)
  WHERE s.venue_id = p_venue_id AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id
    AND (SELECT count(*) FROM public.schedules same_item WHERE same_item.tenant_id = s.tenant_id
      AND same_item.festival_id = s.festival_id AND same_item.item_id = s.item_id) = 1
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible))
    AND (r.entry_kind = 'general_team' OR p.id IS NOT NULL);

  RETURN jsonb_build_object(
    'venue', jsonb_build_object('id', v_venue.id, 'name', v_venue.name, 'location', v_venue.location),
    'schedules', v_schedules,
    'registrations', v_registrations
  );
END;
$function$;
ALTER FUNCTION "public"."stage_venue_portal_data"(p_venue_id uuid, p_pin text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.stage_venue_portal_update_registration(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
  v_pin_error text;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN jsonb_build_object('error', v_pin_error); END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  SELECT * INTO v_schedule FROM public.schedules s WHERE s.id = p_schedule_id
    AND s.venue_id = p_venue_id AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules other_schedule WHERE other_schedule.tenant_id = v_schedule.tenant_id
    AND other_schedule.festival_id = v_schedule.festival_id AND other_schedule.item_id = v_schedule.item_id
    AND other_schedule.id <> v_schedule.id) THEN
    RAISE EXCEPTION 'This item is scheduled at more than one stage. Registration ownership is ambiguous; ask an administrator to resolve the schedule before editing.' USING ERRCODE = '55000';
  END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN RAISE EXCEPTION 'This event is locked.' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_registration FROM public.registrations r
  WHERE r.id = p_registration_id AND r.item_id = v_schedule.item_id AND r.festival_id = v_schedule.festival_id
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)));
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('verify', 'unverify', 'reject', 'restore') THEN RAISE EXCEPTION 'Unsupported action.' USING ERRCODE = '22023'; END IF;
  v_old := to_jsonb(v_registration);
  IF p_action = 'verify' THEN UPDATE public.registrations SET is_verified = true WHERE id = p_registration_id;
  ELSIF p_action = 'unverify' THEN UPDATE public.registrations SET is_verified = false WHERE id = p_registration_id;
  ELSIF p_action = 'reject' THEN UPDATE public.registrations SET status = 'rejected', is_verified = false, code_letter = NULL WHERE id = p_registration_id;
  ELSE UPDATE public.registrations SET status = 'approved', is_verified = false WHERE id = p_registration_id;
  END IF;
  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = p_registration_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_venue.tenant_id, auth.uid(), 'stage_venue_portal_' || p_action, 'registrations', p_registration_id,
    v_old || jsonb_build_object('schedule_id', p_schedule_id, 'venue_id', p_venue_id),
    v_new || jsonb_build_object('schedule_id', p_schedule_id, 'venue_id', p_venue_id));
  RETURN jsonb_build_object('registration_id', p_registration_id, 'action', p_action);
END;
$function$;
ALTER FUNCTION "public"."stage_venue_portal_update_registration"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.stage_venue_portal_update_code_letter(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_pin_error text;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN jsonb_build_object('error', v_pin_error); END IF;
  IF p_code_letter IS NULL OR pg_catalog.upper(trim(p_code_letter)) !~ '^[A-Z]$' THEN
    RAISE EXCEPTION 'Code letter must be a single letter from A to Z.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  SELECT * INTO v_schedule FROM public.schedules s WHERE s.id = p_schedule_id
    AND s.venue_id = p_venue_id AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules other_schedule WHERE other_schedule.tenant_id = v_schedule.tenant_id
    AND other_schedule.festival_id = v_schedule.festival_id AND other_schedule.item_id = v_schedule.item_id
    AND other_schedule.id <> v_schedule.id) THEN
    RAISE EXCEPTION 'This item is scheduled at more than one stage. Registration ownership is ambiguous; ask an administrator to resolve the schedule before editing.' USING ERRCODE = '55000';
  END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN RAISE EXCEPTION 'Code letters are locked.' USING ERRCODE = '55000'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_schedule.festival_id::text || ':' || v_schedule.item_id::text, 0));
  SELECT * INTO v_registration FROM public.registrations r WHERE r.id = p_registration_id
    AND r.item_id = v_schedule.item_id AND r.festival_id = v_schedule.festival_id
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)));
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF v_registration.status = 'rejected' OR v_registration.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified and active registrations can receive a code letter.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.registrations r WHERE r.id <> p_registration_id
    AND r.item_id = v_schedule.item_id AND r.festival_id = v_schedule.festival_id
    AND r.status <> 'rejected' AND r.is_verified IS TRUE
    AND pg_catalog.upper(trim(r.code_letter)) = pg_catalog.upper(trim(p_code_letter))
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)))) THEN
    RAISE EXCEPTION 'This code letter is already assigned in the event.' USING ERRCODE = '23505';
  END IF;
  UPDATE public.registrations SET code_letter = pg_catalog.upper(trim(p_code_letter)) WHERE id = p_registration_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_venue.tenant_id, auth.uid(), 'stage_venue_portal_code_letter_update', 'registrations', p_registration_id,
    to_jsonb(v_registration) || jsonb_build_object('venue_id', p_venue_id, 'schedule_id', p_schedule_id),
    (to_jsonb(v_registration) - 'code_letter') || jsonb_build_object('code_letter', pg_catalog.upper(trim(p_code_letter)), 'venue_id', p_venue_id, 'schedule_id', p_schedule_id));
  RETURN jsonb_build_object('registration_id', p_registration_id, 'code_letter', pg_catalog.upper(trim(p_code_letter)));
END;
$function$;
ALTER FUNCTION "public"."stage_venue_portal_update_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.stage_venue_portal_draw_letters(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v public.venues; pin_error text;
BEGIN
  pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF pin_error IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('error', pin_error); END IF;
  SELECT * INTO v FROM public.venues WHERE id = p_venue_id;
  IF NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = p_schedule_id AND s.venue_id = v.id
    AND s.tenant_id = v.tenant_id AND s.festival_id = v.festival_id) THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  RETURN code_letter_private.draw(v.tenant_id, p_schedule_id, p_overwrite, true, v.id, v.festival_id);
END $function$;
ALTER FUNCTION "public"."stage_venue_portal_draw_letters"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.stage_venue_portal_lock_schedule(p_venue_id uuid, p_pin text, p_schedule_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_pin_error text;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN jsonb_build_object('error', v_pin_error); END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  UPDATE public.schedules SET is_shuffle_locked = true, shuffle_locked_at = pg_catalog.now(), updated_at = pg_catalog.now()
  WHERE id = p_schedule_id AND venue_id = p_venue_id AND tenant_id = v_venue.tenant_id AND festival_id = v_venue.festival_id
  RETURNING * INTO v_schedule;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules other_schedule WHERE other_schedule.tenant_id = v_schedule.tenant_id
    AND other_schedule.festival_id = v_schedule.festival_id AND other_schedule.item_id = v_schedule.item_id
    AND other_schedule.id <> v_schedule.id) THEN
    RAISE EXCEPTION 'This item is scheduled at more than one stage. Registration ownership is ambiguous; ask an administrator to resolve the schedule before editing.' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_venue.tenant_id, auth.uid(), 'stage_venue_portal_schedule_lock', 'schedules', p_schedule_id,
    to_jsonb(v_schedule) || jsonb_build_object('is_shuffle_locked', false), to_jsonb(v_schedule));
  RETURN jsonb_build_object('schedule_id', p_schedule_id, 'locked', true);
END;
$function$;
ALTER FUNCTION "public"."stage_venue_portal_lock_schedule"(p_venue_id uuid, p_pin text, p_schedule_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.default_grade_point_map(p_map jsonb, p_key text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_map) IS DISTINCT FROM 'object' THEN p_map
    WHEN p_key IS NOT NULL AND p_map ? p_key THEN jsonb_build_object(p_key,p_map->p_key)
    ELSE '{}'::jsonb
  END
$function$;
ALTER FUNCTION "scoring_private"."default_grade_point_map"(p_map jsonb, p_key text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.normalize_default_grade_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE participant jsonb; group_row jsonb; participant_key text; group_key text;
  sections jsonb; section jsonb; point_map jsonb;
BEGIN
  -- Compatibility columns remain present, but cannot re-enable range scoring.
  NEW.member_brackets_enabled:=false;
  NEW.allow_bracket_override:=false;

  IF jsonb_typeof(NEW.point_brackets)='array' THEN
    SELECT entry.value INTO participant FROM jsonb_array_elements(NEW.point_brackets) AS entry(value)
      WHERE COALESCE((entry.value->>'enabled')::boolean,true)
      ORDER BY (entry.value->>'min')::numeric,entry.value->>'key' LIMIT 1;
  END IF;
  IF participant IS NOT NULL AND NULLIF(btrim(participant->>'key'),'') IS NOT NULL THEN
    participant_key:=participant->>'key';
    participant:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(participant,'{label}',to_jsonb('Default grade points'::text),true),
      '{min}','1'::jsonb,true),'{max}','null'::jsonb,true),'{enabled}','true'::jsonb,true);
    NEW.point_brackets:=jsonb_build_array(participant);
    NEW.grade_boost_points:=scoring_private.default_grade_point_map(NEW.grade_boost_points,participant_key);
  END IF;

  IF COALESCE(NEW.separate_group_brackets,false) THEN
    IF jsonb_typeof(NEW.group_point_brackets)='array' THEN
      SELECT entry.value INTO group_row FROM jsonb_array_elements(NEW.group_point_brackets) AS entry(value)
        WHERE COALESCE((entry.value->>'enabled')::boolean,true)
        ORDER BY (entry.value->>'min')::numeric,entry.value->>'key' LIMIT 1;
    END IF;
    IF group_row IS NOT NULL AND NULLIF(btrim(group_row->>'key'),'') IS NOT NULL THEN
      group_key:=group_row->>'key';
      group_row:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(group_row,'{label}',to_jsonb('Default group grade points'::text),true),
        '{min}','1'::jsonb,true),'{max}','null'::jsonb,true),'{enabled}','true'::jsonb,true);
      NEW.group_point_brackets:=jsonb_build_array(group_row);
      NEW.group_grade_boost_points:=scoring_private.default_grade_point_map(NEW.group_grade_boost_points,group_key);
    END IF;
  ELSE
    group_key:=participant_key;
    NEW.group_point_brackets:=NEW.point_brackets;
    NEW.group_grade_boost_points:=scoring_private.default_grade_point_map(NEW.grade_boost_points,group_key);
  END IF;

  IF jsonb_typeof(NEW.grade_boost_sections)='array' THEN
    sections:='[]'::jsonb;
    FOR section IN SELECT entry.value FROM jsonb_array_elements(NEW.grade_boost_sections) AS entry(value) LOOP
      IF jsonb_typeof(section)='object' THEN
        IF participant_key IS NOT NULL AND jsonb_typeof(section->'points')='object' THEN
          point_map:=scoring_private.default_grade_point_map(section->'points',participant_key);
          section:=jsonb_set(section,'{points}',point_map,true);
        END IF;
        IF group_key IS NOT NULL AND jsonb_typeof(section->'group_points')='object' THEN
          point_map:=scoring_private.default_grade_point_map(section->'group_points',group_key);
          section:=jsonb_set(section,'{group_points}',point_map,true);
        END IF;
      END IF;
      sections:=sections||jsonb_build_array(section);
    END LOOP;
    NEW.grade_boost_sections:=sections;
  END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION "scoring_private"."normalize_default_grade_points"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION code_letter_private.clear_fixed_on_clear()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN
  IF NEW.code_letter IS NULL THEN NEW.code_letter_fixed := false; END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION "code_letter_private"."clear_fixed_on_clear"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION code_letter_private.entries(s schedules, portal boolean)
 RETURNS SETOF registrations
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT r.* FROM public.registrations r
  WHERE r.item_id = s.item_id AND r.festival_id = s.festival_id
    AND (r.organisation_id IN (SELECT v.id FROM public.get_visible_organisations(s.tenant_id) v)
      OR r.tenant_id IN (SELECT v.tenant_id FROM public.get_visible_organisations(s.tenant_id) v)
      OR (portal AND EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT v.id FROM public.get_visible_organisations(s.tenant_id) v))));
$function$;
ALTER FUNCTION "code_letter_private"."entries"(s schedules, portal boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION code_letter_private.lock_schedule(tenant uuid, schedule uuid)
 RETURNS schedules
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.schedules; original_festival uuid; original_item uuid;
BEGIN
  SELECT * INTO s FROM public.schedules WHERE id = schedule AND tenant_id = tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside the current scope.' USING ERRCODE = '42501'; END IF;
  original_festival := s.festival_id;
  original_item := s.item_id;
  -- Festival lock also serializes edits to overlapping events against each other.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('code-letters:' || s.festival_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s.festival_id::text || ':' || s.item_id::text, 0));
  SELECT * INTO s FROM public.schedules WHERE id = schedule AND tenant_id = tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside the current scope.' USING ERRCODE = '42501'; END IF;
  IF s.festival_id IS DISTINCT FROM original_festival OR s.item_id IS DISTINCT FROM original_item THEN
    RAISE EXCEPTION 'Schedule changed. Refresh and try again.' USING ERRCODE = '40001'; END IF;
  IF s.is_shuffle_locked THEN RAISE EXCEPTION 'Code letters are locked.' USING ERRCODE = '55000'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules other WHERE other.tenant_id = tenant
    AND other.festival_id = s.festival_id AND other.item_id = s.item_id AND other.id <> s.id) THEN
    RAISE EXCEPTION 'Registration ownership is ambiguous: this item has multiple schedules.' USING ERRCODE = '55000';
  END IF;
  -- Re-read registrations only after obtaining both assignment and row locks.
  PERFORM r.id FROM public.registrations r WHERE r.item_id = s.item_id AND r.festival_id = s.festival_id
    ORDER BY r.id FOR UPDATE;
  RETURN s;
END $function$;
ALTER FUNCTION "code_letter_private"."lock_schedule"(tenant uuid, schedule uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION code_letter_private.people(registration uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT r.participant_id FROM public.registrations r WHERE r.id = registration AND r.participant_id IS NOT NULL
  UNION SELECT g.participant_id FROM public.group_members g WHERE g.registration_id = registration AND g.participant_id IS NOT NULL;
$function$;
ALTER FUNCTION "code_letter_private"."people"(registration uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION code_letter_private.conflicts(s schedules, registration uuid, portal boolean)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH members AS MATERIALIZED (SELECT person FROM code_letter_private.people(registration) person)
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT r.code_letter), ARRAY[]::text[])
  FROM public.registrations r JOIN public.schedules other
    ON other.item_id = r.item_id AND other.festival_id = r.festival_id AND other.tenant_id = s.tenant_id
  WHERE r.festival_id = s.festival_id AND other.id <> s.id
    AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter IS NOT NULL
    AND other.start_time < s.end_time AND other.end_time > s.start_time
    AND (r.organisation_id IN (SELECT v.id FROM public.get_visible_organisations(s.tenant_id) v)
      OR r.tenant_id IN (SELECT v.tenant_id FROM public.get_visible_organisations(s.tenant_id) v)
      OR (portal AND EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT v.id FROM public.get_visible_organisations(s.tenant_id) v))))
    AND (r.participant_id IN (SELECT person FROM members) OR EXISTS (
      SELECT 1 FROM public.group_members g WHERE g.registration_id = r.id AND g.participant_id IN (SELECT person FROM members)));
$function$;
ALTER FUNCTION "code_letter_private"."conflicts"(s schedules, registration uuid, portal boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION code_letter_private.edit(tenant uuid, schedule uuid, registration uuid, letter text, expected_letter text, expected_swap uuid, portal boolean, venue uuid DEFAULT NULL::uuid, festival uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.schedules; source public.registrations; target public.registrations;
  targets integer; before_rows jsonb; changed jsonb;
BEGIN
  IF letter IS NULL OR pg_catalog.upper(pg_catalog.btrim(letter)) !~ '^[A-Z]$' THEN
    RAISE EXCEPTION 'Enter one letter from A to Z.' USING ERRCODE = '22023'; END IF;
  letter := pg_catalog.upper(pg_catalog.btrim(letter));
  s := code_letter_private.lock_schedule(tenant, schedule);
  IF portal AND (s.venue_id IS DISTINCT FROM venue OR s.festival_id IS DISTINCT FROM festival) THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO source FROM code_letter_private.entries(s, portal) r WHERE r.id = registration;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration is outside the current schedule scope.' USING ERRCODE = '42501'; END IF;
  IF source.status = 'rejected' OR source.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified active entries can receive code letters.' USING ERRCODE = '22023'; END IF;
  IF source.code_letter IS DISTINCT FROM expected_letter THEN
    RAISE EXCEPTION 'Code letters changed. Refresh and review the edit again.' USING ERRCODE = '40001'; END IF;
  SELECT count(*) INTO targets FROM code_letter_private.entries(s, portal) r
    WHERE r.id <> registration AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter = letter;
  IF targets > 1 THEN RAISE EXCEPTION 'Duplicate existing letters must be resolved before swapping.' USING ERRCODE = '23505'; END IF;
  SELECT * INTO target FROM code_letter_private.entries(s, portal) r
    WHERE r.id <> registration AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter = letter;
  IF target.id IS DISTINCT FROM expected_swap THEN
    RAISE EXCEPTION 'The target letter changed. Refresh and review the swap again.' USING ERRCODE = '40001'; END IF;
  IF target.id IS NOT NULL AND (source.code_letter IS NULL OR source.code_letter !~ '^[A-Z]$') THEN
    RAISE EXCEPTION 'This entry has no letter to swap. Choose an unused letter.' USING ERRCODE = '22023'; END IF;
  IF target.id IS NOT NULL AND EXISTS (SELECT 1 FROM code_letter_private.entries(s, portal) r
    WHERE r.id NOT IN (source.id, target.id) AND r.status <> 'rejected' AND r.is_verified IS TRUE
      AND r.code_letter = source.code_letter) THEN
    RAISE EXCEPTION 'Duplicate existing letters must be resolved before swapping.' USING ERRCODE = '23505'; END IF;
  IF NOT EXISTS (SELECT 1 FROM code_letter_private.people(source.id)) OR
    (target.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM code_letter_private.people(target.id))) THEN
    RAISE EXCEPTION 'The entry has no participant roster; letters cannot be assigned safely.' USING ERRCODE = '22023'; END IF;
  IF letter = ANY(code_letter_private.conflicts(s, source.id, portal)) OR
    (target.id IS NOT NULL AND source.code_letter = ANY(code_letter_private.conflicts(s, target.id, portal))) THEN
    RAISE EXCEPTION 'The new letter conflicts with an overlapping event for one of these entries.' USING ERRCODE = '22023'; END IF;

  SELECT pg_catalog.jsonb_agg(to_jsonb(r)) INTO before_rows
    FROM public.registrations r WHERE r.id IN (source.id, target.id);

  IF target.id IS NULL THEN
    UPDATE public.registrations r SET code_letter = letter, code_letter_fixed = true WHERE r.id = source.id;
  ELSE
    -- NULL is excluded from the deployment's unique index. Both letters are
    -- released first; assigning the distinct final values then cannot collide,
    -- regardless of row update order. Both statements remain in this RPC's
    -- transaction, so other sessions never observe the intermediate values.
    UPDATE public.registrations r SET code_letter = NULL, code_letter_fixed = false
      WHERE r.id IN (source.id, target.id);
    UPDATE public.registrations r
      SET code_letter = CASE WHEN r.id = source.id THEN letter ELSE source.code_letter END,
          code_letter_fixed = true
      WHERE r.id IN (source.id, target.id);
  END IF;

  SELECT pg_catalog.jsonb_agg(to_jsonb(r)) INTO changed
    FROM public.registrations r WHERE r.id IN (source.id, target.id);
  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    SELECT tenant, auth.uid(), CASE WHEN target.id IS NULL THEN 'code_letter_manual_assign' ELSE 'code_letter_swap' END,
      'registrations', (old_row->>'id')::uuid, old_row || pg_catalog.jsonb_build_object('schedule_id', schedule),
      new_row || pg_catalog.jsonb_build_object('schedule_id', schedule)
    FROM pg_catalog.jsonb_array_elements(before_rows) old_row
    JOIN pg_catalog.jsonb_array_elements(changed) new_row ON old_row->>'id' = new_row->>'id';
  RETURN pg_catalog.jsonb_build_object('changed', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', row->'id', 'code_letter', row->'code_letter', 'code_letter_fixed', row->'code_letter_fixed'))
    FROM pg_catalog.jsonb_array_elements(changed) row), 'swapped', target.id IS NOT NULL);
END $function$;
ALTER FUNCTION "code_letter_private"."edit"(tenant uuid, schedule uuid, registration uuid, letter text, expected_letter text, expected_swap uuid, portal boolean, venue uuid, festival uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION code_letter_private.match_entry(entry text, choices jsonb, matching jsonb, seen text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE letter text; moved jsonb;
BEGIN
  FOR letter IN SELECT pg_catalog.jsonb_array_elements_text(choices->entry) LOOP
    IF letter = ANY(seen) THEN CONTINUE; END IF;
    IF NOT matching ? letter THEN RETURN matching || pg_catalog.jsonb_build_object(letter, entry); END IF;
    moved := code_letter_private.match_entry(matching->>letter, choices, matching, pg_catalog.array_append(seen, letter));
    IF moved IS NOT NULL THEN RETURN moved || pg_catalog.jsonb_build_object(letter, entry); END IF;
  END LOOP;
  RETURN NULL;
END $function$;
ALTER FUNCTION "code_letter_private"."match_entry"(entry text, choices jsonb, matching jsonb, seen text[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION code_letter_private.draw(tenant uuid, schedule uuid, overwrite boolean, portal boolean, venue uuid DEFAULT NULL::uuid, festival uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.schedules; current_entry public.registrations; used text[]; pool text[]; blocked text[];
  choices jsonb := '{}'::jsonb; matching jsonb := '{}'::jsonb; candidates jsonb; before_rows jsonb;
  remaining integer; eligible integer; total_fixed integer; entry text; conflict_fallback boolean := false;
BEGIN
  s := code_letter_private.lock_schedule(tenant, schedule);
  IF portal AND (s.venue_id IS DISTINCT FROM venue OR s.festival_id IS DISTINCT FROM festival) THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  SELECT count(*), count(*) FILTER (WHERE code_letter_fixed) INTO eligible, total_fixed
    FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE;
  IF eligible = 0 THEN RAISE EXCEPTION 'No verified active entries are available for the draw.' USING ERRCODE = '22023'; END IF;
  IF eligible > 26 THEN RAISE EXCEPTION 'Only 26 unique A-Z letters are available.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE
    AND r.code_letter IS NOT NULL AND (r.code_letter_fixed OR NOT overwrite)
    GROUP BY r.code_letter HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate preserved letters must be resolved before drawing.' USING ERRCODE = '23505'; END IF;
  SELECT COALESCE(pg_catalog.array_agg(r.code_letter), ARRAY[]::text[]) INTO used
    FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE
      AND r.code_letter IS NOT NULL AND (r.code_letter_fixed OR NOT overwrite);
  SELECT pg_catalog.jsonb_agg(to_jsonb(r)), count(*) INTO before_rows, remaining
    FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE
      AND NOT r.code_letter_fixed AND (overwrite OR r.code_letter IS NULL);
  IF remaining = 0 THEN RETURN pg_catalog.jsonb_build_object('assigned', 0, 'fixed', total_fixed); END IF;
  SELECT pg_catalog.array_agg(letter) INTO pool FROM (
    SELECT pg_catalog.chr(n) AS letter FROM pg_catalog.generate_series(65,90) n
    WHERE NOT pg_catalog.chr(n) = ANY(used) ORDER BY n LIMIT remaining
  ) letters;
  FOR current_entry IN SELECT e.* FROM code_letter_private.entries(s, portal) e WHERE e.status <> 'rejected' AND e.is_verified IS TRUE
    AND NOT e.code_letter_fixed AND (overwrite OR e.code_letter IS NULL) LOOP
    IF NOT EXISTS (SELECT 1 FROM code_letter_private.people(current_entry.id)) THEN
      RAISE EXCEPTION 'The entry has no participant roster; letters cannot be drawn safely.' USING ERRCODE = '22023'; END IF;
    blocked := code_letter_private.conflicts(s, current_entry.id, portal);
    SELECT COALESCE(pg_catalog.jsonb_agg(letter ORDER BY (SELECT pg_catalog.min(pg_catalog.abs(pg_catalog.ascii(letter) - pg_catalog.ascii(conflict)))
      FROM pg_catalog.unnest(blocked) conflict) DESC NULLS FIRST, pg_catalog.random()), '[]'::jsonb) INTO candidates
      FROM pg_catalog.unnest(pool) letter WHERE NOT letter = ANY(blocked);
    choices := choices || pg_catalog.jsonb_build_object(current_entry.id::text, candidates);
  END LOOP;
  FOR entry IN SELECT key FROM pg_catalog.jsonb_each(choices) ORDER BY pg_catalog.jsonb_array_length(value), key LOOP
    matching := code_letter_private.match_entry(entry, choices, matching, ARRAY[]::text[]);
    IF matching IS NULL THEN conflict_fallback := true; EXIT; END IF;
  END LOOP;
  IF conflict_fallback THEN
    -- Preserve the established draw's best-effort fallback when a fully safe
    -- permutation is impossible. Manual edits/swaps still reject conflicts.
    matching := '{}'::jsonb;
    FOR entry IN SELECT key FROM pg_catalog.jsonb_each(choices) ORDER BY pg_catalog.jsonb_array_length(value), key LOOP
      candidates := choices->entry;
      SELECT COALESCE(pg_catalog.jsonb_agg(letter ORDER BY pg_catalog.random()), '[]'::jsonb) INTO candidates
        FROM pg_catalog.unnest(pool) letter WHERE NOT matching ? letter
        AND candidates ? letter;
      IF pg_catalog.jsonb_array_length(candidates) = 0 THEN
        SELECT pg_catalog.jsonb_agg(letter ORDER BY pg_catalog.random()) INTO candidates
          FROM pg_catalog.unnest(pool) letter WHERE NOT matching ? letter;
      END IF;
      matching := matching || pg_catalog.jsonb_build_object(candidates->>0, entry);
    END LOOP;
  END IF;

  -- Redraws can permute existing automatic letters. Clear the entries being
  -- reassigned first so an immediate unique index never sees a transient clash.
  UPDATE public.registrations r SET code_letter = NULL, code_letter_fixed = false
    WHERE r.code_letter IS NOT NULL AND r.id IN (
      SELECT allocation.value::uuid FROM pg_catalog.jsonb_each_text(matching) allocation
    );
  UPDATE public.registrations r SET code_letter = allocation.key, code_letter_fixed = false
    FROM pg_catalog.jsonb_each_text(matching) allocation WHERE r.id = allocation.value::uuid;
  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    SELECT tenant, auth.uid(), 'code_letter_draw', 'registrations', r.id,
      old_row || pg_catalog.jsonb_build_object('schedule_id', schedule),
      to_jsonb(r) || pg_catalog.jsonb_build_object('schedule_id', schedule)
    FROM pg_catalog.jsonb_array_elements(before_rows) old_row JOIN public.registrations r ON r.id = (old_row->>'id')::uuid;
  RETURN pg_catalog.jsonb_build_object('assigned', remaining, 'fixed', total_fixed, 'conflictsUnavoidable', conflict_fallback);
END $function$;
ALTER FUNCTION "code_letter_private"."draw"(tenant uuid, schedule uuid, overwrite boolean, portal boolean, venue uuid, festival uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.stage_edit_code_letter(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN
  RETURN code_letter_private.edit(public.stage_assert_admin_access(), p_schedule_id, p_registration_id,
    p_code_letter, p_expected_letter, p_expected_swap_id, false);
END $function$;
ALTER FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.stage_draw_code_letters(p_schedule_id uuid, p_overwrite boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN
  RETURN code_letter_private.draw(public.stage_assert_admin_access(), p_schedule_id, p_overwrite, false);
END $function$;
ALTER FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.stage_venue_portal_edit_code_letter(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v public.venues; pin_error text;
BEGIN
  pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF pin_error IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('error', pin_error); END IF;
  SELECT * INTO v FROM public.venues WHERE id = p_venue_id;
  IF NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = p_schedule_id AND s.venue_id = v.id
    AND s.tenant_id = v.tenant_id AND s.festival_id = v.festival_id) THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  RETURN code_letter_private.edit(v.tenant_id, p_schedule_id, p_registration_id, p_code_letter,
    p_expected_letter, p_expected_swap_id, true, v.id, v.festival_id);
END $function$;
ALTER FUNCTION "public"."stage_venue_portal_edit_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION code_letter_private.notify_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s record; changed record;
BEGIN
  -- One hint per event per SQL statement, including a full multi-row draw.
  FOR changed IN SELECT DISTINCT n.festival_id, n.item_id FROM code_letter_new n JOIN code_letter_old o ON o.id = n.id
    WHERE n.code_letter IS DISTINCT FROM o.code_letter OR n.code_letter_fixed IS DISTINCT FROM o.code_letter_fixed LOOP
    PERFORM realtime.send('{}'::jsonb, 'changed', 'code-letters:festival:' || changed.festival_id::text, false);
    FOR s IN SELECT id, venue_id FROM public.schedules
      WHERE festival_id = changed.festival_id AND item_id = changed.item_id LOOP
      PERFORM realtime.send('{}'::jsonb, 'changed', 'code-letters:schedule:' || s.id::text, false);
      IF s.venue_id IS NOT NULL THEN
        PERFORM realtime.send('{}'::jsonb, 'changed', 'code-letters:venue:' || s.venue_id::text, false);
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $function$;
ALTER FUNCTION "code_letter_private"."notify_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_stage_management_registrations_with_letters(p_schedule_id uuid DEFAULT NULL::uuid, p_festival_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(scoped)||pg_catalog.jsonb_build_object(
    'code_letter_fixed',r.code_letter_fixed,'entry_kind',r.entry_kind,
    'entry_chest_number',group_entry_private.chest_number(r),
    'group_leader_participant_id',r.group_leader_participant_id,
    'group_leader_profile_slug',(SELECT p.profile_slug FROM public.participants p WHERE p.id=r.group_leader_participant_id),
    'members',CASE WHEN r.entry_kind='general_team' THEN COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',p.name,'chest_number',p.chest_number,
        'is_leader',p.id=r.group_leader_participant_id) ORDER BY gm.member_order NULLS LAST,p.name,p.id)
      FROM public.group_members gm JOIN public.participants p ON p.id=gm.participant_id
      WHERE gm.registration_id=r.id),'[]'::jsonb) ELSE '[]'::jsonb END)),'[]'::jsonb)
  FROM public.get_stage_management_registrations_scoped(p_schedule_id,p_festival_id) scoped
  JOIN public.registrations r ON r.id=scoped.id;
$function$;
ALTER FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.stage_venue_portal_data_with_letters(p_venue_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE data jsonb;
BEGIN
  data := public.stage_venue_portal_data(p_venue_id, p_pin);
  IF data ? 'error' THEN RETURN data; END IF;
  RETURN pg_catalog.jsonb_set(data, '{registrations}', COALESCE((
    SELECT pg_catalog.jsonb_agg(entry || pg_catalog.jsonb_build_object('code_letter_fixed', r.code_letter_fixed) ORDER BY position)
    FROM pg_catalog.jsonb_array_elements(data->'registrations') WITH ORDINALITY entries(entry, position)
    JOIN public.registrations r ON r.id = (entry->>'id')::uuid
  ), '[]'::jsonb));
END $function$;
ALTER FUNCTION "public"."stage_venue_portal_data_with_letters"(p_venue_id uuid, p_pin text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_team_leader_programs(p_participant_id uuid)
 RETURNS TABLE(item_id uuid, item_code text, item_name_en text, item_name_ml text, category_codes text[], gender text, participation_type text, group_min_members integer, group_max_members integer, entry_kind text, is_assigned boolean, is_eligible boolean, team_entry_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_context record;
  v_festival public.festival_calendar%ROWTYPE;
  v_participant public.participants%ROWTYPE;
  v_org_tenant_id uuid;
  v_is_post_hs_religious boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  SELECT f.* INTO v_festival
  FROM public.festival_calendar f
  WHERE f.id = v_context.festival_id AND f.tenant_id = v_context.parent_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The assigned festival is unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT o.tenant_id INTO v_org_tenant_id FROM public.organisations o WHERE o.id=v_context.organisation_id AND o.tenant_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) visible WHERE visible.id=o.id AND visible.tenant_id=o.tenant_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'The assigned team is outside the festival tenant scope.' USING ERRCODE='42501'; END IF;

  SELECT p.* INTO v_participant
  FROM public.participants p
  WHERE p.id = p_participant_id
    AND p.tenant_id IN (v_context.parent_tenant_id, v_org_tenant_id)
    AND p.festival_id = v_context.festival_id
    AND p.organisation_id = v_context.organisation_id;
  IF NOT FOUND OR v_participant.status = 'rejected' THEN
    RAISE EXCEPTION 'This student is not available in your team.' USING ERRCODE = '42501';
  END IF;
  -- The Admin model treats this legacy participant field as optional and no
  -- migration in this branch declares it, so read it without a static column
  -- dependency while preserving the Admin rule when it is present.
  v_is_post_hs_religious := COALESCE((to_jsonb(v_participant)->>'is_post_hs_religious')::boolean, false);

  RETURN QUERY
  SELECT i.id,
         i.item_code,
         i.item_name_en,
         i.item_name_ml,
         i.category_codes,
         i.gender,
         i.participation_type,
         i.group_min_members,
         i.group_max_members,
         CASE WHEN lower(COALESCE(i.participation_type, '')) = 'group' THEN 'general_team' ELSE 'participant' END,
         EXISTS (
           SELECT 1 FROM public.registrations r
            WHERE r.participant_id = v_participant.id
              AND r.festival_id = v_context.festival_id
              AND r.item_id = i.id
              AND r.organisation_id = v_context.organisation_id
              AND r.entry_kind = 'participant'
         ),
         (
           CASE
             WHEN lower(COALESCE(i.participation_type, '')) = 'group' THEN
               i.is_active IS TRUE
               AND v_festival.general_category_enabled IS TRUE
               AND cardinality(COALESCE(i.category_codes, ARRAY[]::text[])) = 1
               AND upper(btrim(COALESCE(i.category_codes[1], ''))) IN ('GN', 'GENERAL')
               AND COALESCE(i.group_min_members, 0) >= 1
             ELSE
               i.is_active IS TRUE
               AND v_participant.status IS DISTINCT FROM 'rejected'
               AND (v_participant.plagiarism_ban_until IS NULL OR v_participant.plagiarism_ban_until <= current_date)
                AND (
                  EXISTS (SELECT 1 FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code)) IN (
                    upper(btrim(COALESCE(v_participant.category_code,''))),
                    CASE upper(btrim(COALESCE(v_participant.category_code,''))) WHEN 'JUNIOR' THEN 'JR' WHEN 'JR' THEN 'JUNIOR' WHEN 'SENIOR' THEN 'SR' WHEN 'SR' THEN 'SENIOR' WHEN 'CAMPUS' THEN 'CA' WHEN 'CA' THEN 'CAMPUS' ELSE upper(btrim(COALESCE(v_participant.category_code,''))) END))
                  OR (v_is_post_hs_religious IS TRUE AND EXISTS(SELECT 1 FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code)) IN ('JR','JUNIOR','SR','SENIOR')))
                  OR EXISTS(SELECT 1 FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code)) IN ('GN','GENERAL'))
                )
                AND NOT (v_is_post_hs_religious IS TRUE AND EXISTS(SELECT 1 FROM unnest(COALESCE(i.category_codes, ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code))='HS'))
                AND NOT EXISTS(SELECT 1 FROM public.registrations r WHERE r.participant_id=v_participant.id AND r.festival_id=v_context.festival_id AND r.organisation_id IS DISTINCT FROM v_context.organisation_id)
                AND (COALESCE(lower(btrim(i.gender)),'both') IN ('','both') OR lower(btrim(i.gender))=lower(btrim(COALESCE(v_participant.gender,''))))
           END
         ),
         CASE WHEN lower(COALESCE(i.participation_type, '')) = 'group' THEN (
           SELECT count(*)::integer FROM public.registrations r
           WHERE r.item_id = i.id AND r.festival_id = v_context.festival_id
             AND r.organisation_id = v_context.organisation_id AND r.entry_kind = 'general_team'
         ) ELSE 0 END
  FROM public.items i
  WHERE i.festival_id = v_context.festival_id
    AND (i.tenant_id IS NULL OR i.tenant_id = v_context.parent_tenant_id)
    AND lower(COALESCE(i.participation_type, '')) IN ('individual', 'group')
    AND (
      lower(COALESCE(i.participation_type, '')) = 'individual'
      OR (
        cardinality(COALESCE(i.category_codes, ARRAY[]::text[])) = 1
        AND upper(btrim(COALESCE(i.category_codes[1], ''))) IN ('GN', 'GENERAL')
      )
    )
    AND (
      i.is_active IS TRUE
      OR EXISTS (
        SELECT 1 FROM public.registrations r
        WHERE r.item_id = i.id AND (
          (r.participant_id = v_participant.id AND r.entry_kind = 'participant')
          OR (r.organisation_id = v_context.organisation_id AND r.entry_kind = 'general_team')
        )
      )
    )
  ORDER BY i.item_name_en NULLS LAST, i.item_code;
END;
$function$;
ALTER FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.team_leader_create_general_entry(p_item_id uuid, p_participant_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_context record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) o
    WHERE o.id=v_context.organisation_id) THEN
    RAISE EXCEPTION 'An active Team Leader assignment is required.' USING ERRCODE='42501';
  END IF;
  RETURN group_entry_private.create_entry(v_context.festival_id,p_item_id,v_context.organisation_id,p_participant_ids);
END $function$;
ALTER FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.team_leader_assign_program(p_participant_id uuid, p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_context record;
  v_participant public.participants%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_registration_id uuid;
  v_category_matches boolean;
  v_org_tenant_id uuid;
  v_is_post_hs_religious boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE = '42501';
  END IF;

  SELECT o.tenant_id INTO v_org_tenant_id FROM public.organisations o
  WHERE o.id=v_context.organisation_id AND o.tenant_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.get_visible_organisations(v_context.parent_tenant_id) visible WHERE visible.id=o.id AND visible.tenant_id=o.tenant_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'The assigned team is outside the festival tenant scope.' USING ERRCODE='42501'; END IF;

  SELECT p.* INTO v_participant
  FROM public.participants p
  WHERE p.id = p_participant_id
    AND p.tenant_id IN (v_context.parent_tenant_id, v_org_tenant_id)
    AND p.festival_id = v_context.festival_id
    AND p.organisation_id = v_context.organisation_id
  FOR UPDATE;
  IF NOT FOUND OR v_participant.status = 'rejected' THEN
    RAISE EXCEPTION 'This student is not available in your team.' USING ERRCODE = '42501';
  END IF;
  v_is_post_hs_religious := COALESCE((to_jsonb(v_participant)->>'is_post_hs_religious')::boolean, false);

  SELECT i.* INTO v_item
  FROM public.items i
  WHERE i.id = p_item_id
    AND i.festival_id = v_context.festival_id
    AND (i.tenant_id IS NULL OR i.tenant_id = v_context.parent_tenant_id)
    AND i.is_active IS TRUE
    AND lower(COALESCE(i.participation_type, '')) = 'individual'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This program is unavailable.' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS(SELECT 1 FROM unnest(COALESCE(v_item.category_codes,ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code)) IN (
    upper(btrim(COALESCE(v_participant.category_code,''))),
    CASE upper(btrim(COALESCE(v_participant.category_code,''))) WHEN 'JUNIOR' THEN 'JR' WHEN 'JR' THEN 'JUNIOR' WHEN 'SENIOR' THEN 'SR' WHEN 'SR' THEN 'SENIOR' WHEN 'CAMPUS' THEN 'CA' WHEN 'CA' THEN 'CAMPUS' ELSE upper(btrim(COALESCE(v_participant.category_code,''))) END,'GN','GENERAL')) INTO v_category_matches;
  IF NOT v_category_matches AND NOT (v_is_post_hs_religious IS TRUE AND EXISTS(SELECT 1 FROM unnest(COALESCE(v_item.category_codes,ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code)) IN ('JR','JUNIOR','SR','SENIOR'))) THEN
    RAISE EXCEPTION 'This program is not available for the student category.' USING ERRCODE='22023';
  END IF;
  IF v_is_post_hs_religious IS TRUE AND EXISTS(SELECT 1 FROM unnest(COALESCE(v_item.category_codes,ARRAY[]::text[])) AS c(code) WHERE upper(btrim(c.code))='HS') THEN
    RAISE EXCEPTION 'Religious students after HS must compete in JR/SR only.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.registrations r WHERE r.participant_id=v_participant.id AND r.festival_id=v_context.festival_id AND r.organisation_id IS DISTINCT FROM v_context.organisation_id) THEN
    RAISE EXCEPTION 'A participant cannot compete from multiple teams in the same festival.' USING ERRCODE='42501';
  END IF;
  IF COALESCE(lower(btrim(v_item.gender)), 'both') NOT IN ('', 'both')
     AND lower(btrim(v_item.gender)) <> lower(btrim(COALESCE(v_participant.gender, ''))) THEN
    RAISE EXCEPTION 'This program is not available for the student gender.' USING ERRCODE = '22023';
  END IF;
  IF v_participant.plagiarism_ban_until > current_date THEN
    RAISE EXCEPTION 'An active registration restriction prevents this student from entering programs.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.registrations (
    tenant_id, festival_id, participant_id, item_id, organisation_id, status
  ) VALUES (
    v_participant.tenant_id, v_context.festival_id, v_participant.id,
    v_item.id, v_context.organisation_id, 'pending'
  )
  ON CONFLICT (participant_id, item_id) DO NOTHING
  RETURNING id INTO v_registration_id;

  IF v_registration_id IS NULL THEN
    RAISE EXCEPTION 'This student is already assigned to the selected program.' USING ERRCODE = '23505';
  END IF;

  RETURN jsonb_build_object(
    'registration_id', v_registration_id,
    'participant_id', v_participant.id,
    'item_id', v_item.id,
    'status', 'pending'
  );
END;
$function$;
ALTER FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.resolve_team_leader_login_email(p_username text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_match_count integer;
  v_email text;
BEGIN
  IF p_username IS NULL OR p_username = '' THEN
    RETURN NULL;
  END IF;

  SELECT count(*), min(auth_user.email)
    INTO v_match_count, v_email
  FROM public.profiles AS profile
  JOIN auth.users AS auth_user ON auth_user.id = profile.id
  WHERE profile.role = 'team_leader'
    AND profile.team_leader_code = p_username;

  IF v_match_count <> 1 THEN
    RETURN NULL;
  END IF;

  RETURN v_email;
END;
$function$;
ALTER FUNCTION "public"."resolve_team_leader_login_email"(p_username text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_competition_item(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE
  v_owner uuid;
  v_item public.items%ROWTYPE;
  v_category_codes text[];
BEGIN
  SELECT tenant_id INTO v_owner
  FROM public.festival_calendar
  WHERE id = p_festival_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Festival not found.';
  END IF;
  PERFORM scoring_private.assert_admin(v_owner);

  IF p_item_id IS NULL
     OR nullif(btrim(p_item_name_ml), '') IS NULL
     OR p_category_codes IS NULL
     OR COALESCE(cardinality(p_category_codes), 0) = 0
     OR array_ndims(p_category_codes) <> 1
  THEN
    RAISE EXCEPTION 'Invalid competition item details.';
  END IF;

  SELECT array_agg(btrim(category.code) ORDER BY category.ordinality)
  INTO v_category_codes
  FROM unnest(p_category_codes) WITH ORDINALITY AS category(code, ordinality);
  IF EXISTS (
       SELECT 1 FROM unnest(v_category_codes) AS category(code)
       WHERE category.code IS NULL OR category.code = ''
     )
     OR (SELECT count(*) FROM unnest(v_category_codes)) <>
        (SELECT count(DISTINCT category.code) FROM unnest(v_category_codes) AS category(code))
  THEN
    RAISE EXCEPTION 'Category codes must be non-blank and unique.';
  END IF;

  -- Serialize metadata edits with the existing item-change workflow.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text, 0));

  SELECT * INTO v_item
  FROM public.items
  WHERE id = p_item_id
    AND festival_id = p_festival_id
    AND tenant_id = v_owner
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competition item not found for this festival.';
  END IF;
  IF v_item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'This competition changed after it was opened. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  IF v_item.participation_type = 'group' THEN
    IF COALESCE(p_group_member_count, 0) < 1 THEN
      RAISE EXCEPTION 'Enter a positive member count for this group competition.';
    END IF;
  ELSIF v_item.participation_type = 'individual' THEN
    IF p_group_member_count IS NOT NULL THEN
      RAISE EXCEPTION 'Member count can only be set for group competitions.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Competition participation type is invalid.';
  END IF;

  UPDATE public.items
  SET item_name_ml = btrim(p_item_name_ml),
      item_name_en = CASE
        WHEN item_name_en IS NULL OR item_name_en = item_name_ml THEN btrim(p_item_name_ml)
        ELSE item_name_en
      END,
      category_codes = v_category_codes,
      group_min_members = CASE WHEN v_item.participation_type = 'group'
        THEN p_group_member_count ELSE group_min_members END,
      group_max_members = CASE WHEN v_item.participation_type = 'group'
        THEN p_group_member_count ELSE group_max_members END,
      updated_at = clock_timestamp()
  WHERE id = v_item.id
    AND festival_id = p_festival_id
    AND tenant_id = v_owner;
END;
$function$;
ALTER FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION scoring_private.validate_boost_sections(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'scoring_private'
AS $function$
DECLARE family text; sections jsonb; section jsonb; sid text; seen_ids text[]; seen_items text[];
  v_item text; point_map jsonb; bracket jsonb; point_values jsonb; idx integer; point_family text; bracket_rows jsonb; BEGIN
  FOREACH family IN ARRAY ARRAY['grade_boost_sections','rank_boost_sections'] LOOP
    sections:=p->family;
    IF jsonb_typeof(sections) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid boost sections.'; END IF;
    seen_ids:='{}'; seen_items:='{}'; idx:=0;
    FOR section IN SELECT value FROM jsonb_array_elements(sections) LOOP
      idx:=idx+1; sid:=section->>'id';
      IF sid IS NULL OR sid='' OR sid=ANY(seen_ids) THEN RAISE EXCEPTION 'Boost section IDs must be unique.'; END IF;
      seen_ids:=array_append(seen_ids,sid);
      IF jsonb_typeof(section->'item_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid competition list in Section %.',idx; END IF;
      FOR v_item IN SELECT jsonb_array_elements_text(section->'item_ids') LOOP
        IF v_item=ANY(seen_items) THEN RAISE EXCEPTION 'A competition can belong to only one % section.',CASE WHEN family='grade_boost_sections' THEN 'Grade Boost' ELSE 'Rank Boost' END; END IF;
        PERFORM v_item::uuid; seen_items:=array_append(seen_items,v_item);
      END LOOP;
      IF family='rank_boost_sections' AND cardinality(ARRAY(SELECT jsonb_array_elements_text(section->'item_ids')))>0 THEN
        point_values:=section->'points';
        IF jsonb_typeof(point_values) IS DISTINCT FROM 'array' OR jsonb_array_length(point_values)<>3 THEN RAISE EXCEPTION 'Complete Rank Boost points in Section %.',idx; END IF;
        FOR bracket IN SELECT value FROM jsonb_array_elements(point_values) LOOP PERFORM scoring_private.whole(bracket); END LOOP;
      ELSIF family='grade_boost_sections' AND cardinality(ARRAY(SELECT jsonb_array_elements_text(section->'item_ids')))>0 THEN
        FOREACH point_family IN ARRAY ARRAY['points','group_points'] LOOP
          IF point_family='group_points' AND NOT (p->>'separate_group_brackets')::boolean THEN CONTINUE; END IF;
          point_map:=section->point_family;
          IF point_map IS NULL OR jsonb_typeof(point_map) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Complete Grade Boost points in Section %.',idx; END IF;
          bracket_rows:=CASE WHEN point_family='group_points' THEN p->'group_point_brackets' ELSE p->'point_brackets' END;
          FOR bracket IN SELECT value FROM jsonb_array_elements(bracket_rows) LOOP
            IF COALESCE((bracket->>'enabled')::boolean,true) THEN
              point_values:=point_map->(bracket->>'key');
              IF jsonb_typeof(point_values) IS DISTINCT FROM 'array' OR jsonb_array_length(point_values)<>4 THEN RAISE EXCEPTION 'Complete Grade Boost points in Section % for bracket %.',idx,bracket->>'key'; END IF;
              FOR v_item IN SELECT jsonb_array_elements_text(point_values) LOOP PERFORM scoring_private.whole(to_jsonb(v_item::numeric)); END LOOP;
            END IF;
          END LOOP;
        END LOOP;
      END IF;
    END LOOP;
    IF family='grade_boost_sections' THEN
      IF COALESCE((SELECT array_agg(DISTINCT value ORDER BY value) FROM jsonb_array_elements_text(p->'grade_boost_item_ids') value),'{}'::text[])
        IS DISTINCT FROM COALESCE((SELECT array_agg(DISTINCT section_items.item_id ORDER BY section_items.item_id)
          FROM jsonb_array_elements(p->family) AS section_rows(section_data)
          CROSS JOIN LATERAL jsonb_array_elements_text(section_rows.section_data->'item_ids') AS section_items(item_id)),'{}'::text[])
        THEN RAISE EXCEPTION 'Grade Boost competition list does not match its sections.'; END IF;
    ELSE
      IF COALESCE((SELECT array_agg(DISTINCT value ORDER BY value) FROM jsonb_array_elements_text(p->'rank_boost_item_ids') value),'{}'::text[])
        IS DISTINCT FROM COALESCE((SELECT array_agg(DISTINCT section_items.item_id ORDER BY section_items.item_id)
          FROM jsonb_array_elements(p->family) AS section_rows(section_data)
          CROSS JOIN LATERAL jsonb_array_elements_text(section_rows.section_data->'item_ids') AS section_items(item_id)),'{}'::text[])
        THEN RAISE EXCEPTION 'Rank Boost competition list does not match its sections.'; END IF;
    END IF;
  END LOOP;
END $function$;
ALTER FUNCTION "scoring_private"."validate_boost_sections"(p jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.allocate_chest(p_festival uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE owner_id uuid; start_number bigint; candidate bigint;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('entry-chest:'||p_festival::text,0));
  SELECT tenant_id, CASE WHEN chest_number_category_range=1000 THEN 100 ELSE 1000 END
    INTO owner_id,start_number FROM public.festival_calendar WHERE id=p_festival;
  IF NOT FOUND THEN RAISE EXCEPTION 'Festival not found.'; END IF;
  INSERT INTO public.general_entry_number_counters(tenant_id,festival_id)
    VALUES(owner_id,p_festival) ON CONFLICT(festival_id) DO NOTHING;
  SELECT GREATEST(COALESCE(numeric_next_number,start_number),start_number)
    INTO candidate FROM public.general_entry_number_counters WHERE festival_id=p_festival FOR UPDATE;
  LOOP
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.participants WHERE festival_id=p_festival AND chest_number=candidate::text)
      AND NOT EXISTS(SELECT 1 FROM public.registrations WHERE festival_id=p_festival AND entry_kind='general_team' AND entry_chest_number=candidate::text);
    candidate:=candidate+1;
  END LOOP;
  UPDATE public.general_entry_number_counters SET numeric_next_number=candidate+1 WHERE festival_id=p_festival;
  RETURN candidate::text;
END $function$;
ALTER FUNCTION "group_entry_private"."allocate_chest"(p_festival uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.guard_participant_chest()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.chest_number IS NULL OR NEW.festival_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.chest_number IS NOT DISTINCT FROM OLD.chest_number
    AND NEW.festival_id IS NOT DISTINCT FROM OLD.festival_id THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('entry-chest:'||NEW.festival_id::text,0));
  IF EXISTS(SELECT 1 FROM public.registrations WHERE festival_id=NEW.festival_id AND entry_kind='general_team'
    AND entry_chest_number=NEW.chest_number) THEN
    RAISE EXCEPTION 'Chest number is reserved by a General group entry.'
      USING ERRCODE='23505', CONSTRAINT='unique_active_chest_number';
  END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION "group_entry_private"."guard_participant_chest"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.guard_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.entry_kind='general_team' OR NEW.entry_kind='general_team') AND
    (NEW.entry_kind,NEW.tenant_id,NEW.festival_id,NEW.item_id,NEW.organisation_id,NEW.participant_id,NEW.entry_chest_number)
    IS DISTINCT FROM (OLD.entry_kind,OLD.tenant_id,OLD.festival_id,OLD.item_id,OLD.organisation_id,OLD.participant_id,OLD.entry_chest_number) THEN
    RAISE EXCEPTION 'A group entry identity cannot be changed.' USING ERRCODE='23514';
  END IF;
  IF NEW.entry_kind<>'general_team' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' AND NOT EXISTS (SELECT 1 FROM group_entry_private.member_edit_authorizations a
    WHERE a.transaction_id=pg_catalog.txid_current() AND a.registration_id=NEW.id AND a.actor_id=auth.uid()) THEN
    RAISE EXCEPTION 'Create group entries through the group enrollment API.' USING ERRCODE='42501';
  END IF;
  IF NEW.participant_id IS NOT NULL OR NEW.is_group_registration IS NOT TRUE OR NEW.organisation_id IS NULL THEN
    RAISE EXCEPTION 'Group results belong to the team.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.group_leader_participant_id IS NOT NULL AND NEW.group_leader_participant_id IS NULL THEN
    RAISE EXCEPTION 'Select a replacement team leader before saving.' USING ERRCODE='23514';
  END IF;
  IF NEW.group_leader_participant_id IS NOT NULL THEN
    IF TG_OP='INSERT' AND NEW.entry_chest_number IS NOT NULL THEN
      RAISE EXCEPTION 'Use the team leader chest number; a new group number is not needed.' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.participants p
      WHERE p.id=NEW.group_leader_participant_id AND p.festival_id=NEW.festival_id
        AND p.organisation_id=NEW.organisation_id AND p.status IS DISTINCT FROM 'rejected'
        AND NULLIF(pg_catalog.btrim(p.chest_number),'') IS NOT NULL) THEN
      RAISE EXCEPTION 'Select an eligible team leader with a chest number.' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND NEW.group_leader_participant_id IS DISTINCT FROM OLD.group_leader_participant_id
      AND NOT EXISTS (SELECT 1 FROM group_entry_private.member_edit_authorizations a
        WHERE a.transaction_id=pg_catalog.txid_current() AND a.registration_id=NEW.id AND a.actor_id=auth.uid()) THEN
      RAISE EXCEPTION 'Change the leader through Edit members.' USING ERRCODE='42501';
    END IF;
  ELSIF TG_OP='INSERT' THEN
    RAISE EXCEPTION 'Select the first group member as team leader.' USING ERRCODE='23514';
  END IF;
  -- Legacy entries keep their number until an admin explicitly selects a leader.
  RETURN NEW;
END $function$;
ALTER FUNCTION "group_entry_private"."guard_identity"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.guard_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE entry public.registrations; target uuid;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.registration_id,NEW.participant_id) IS NOT DISTINCT FROM (OLD.registration_id,OLD.participant_id) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.registration_id IS DISTINCT FROM OLD.registration_id AND EXISTS(
    SELECT 1 FROM public.registrations WHERE id=OLD.registration_id AND entry_kind='general_team') THEN
    RAISE EXCEPTION 'Remove a membership before assigning it to another group.' USING ERRCODE='23514';
  END IF;
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.registration_id ELSE NEW.registration_id END;
  SELECT * INTO entry FROM public.registrations WHERE id=target FOR UPDATE;
  IF entry.entry_kind='general_team' THEN
    IF (entry.is_verified IS TRUE OR entry.code_letter IS NOT NULL
      OR EXISTS(SELECT 1 FROM public.results WHERE registration_id=entry.id)
      OR EXISTS(SELECT 1 FROM public.mark_entries WHERE registration_id=entry.id))
      AND NOT EXISTS (
        SELECT 1 FROM group_entry_private.member_edit_authorizations permission
        WHERE permission.transaction_id=pg_catalog.txid_current()
          AND permission.registration_id=entry.id
          AND permission.actor_id=auth.uid()
      ) THEN
      RAISE EXCEPTION 'Group roster is locked after check-in, code letters, marks or results.' USING ERRCODE='55000';
    END IF;
    IF TG_OP<>'DELETE' THEN
      IF NOT EXISTS(SELECT 1 FROM public.participants WHERE id=NEW.participant_id
        AND festival_id=entry.festival_id AND organisation_id=entry.organisation_id
        AND status IS DISTINCT FROM 'rejected') THEN
        RAISE EXCEPTION 'Group members must belong to the same festival and team.' USING ERRCODE='23514';
      END IF;
      IF EXISTS(SELECT 1 FROM public.group_members WHERE registration_id=entry.id AND participant_id=NEW.participant_id
        AND id IS DISTINCT FROM NEW.id) THEN
        RAISE EXCEPTION 'This student is already a member of this group.' USING ERRCODE='23505';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION "group_entry_private"."guard_member"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.assert_festival_chest_admin(p_festival_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid;
BEGIN
  SELECT f.tenant_id INTO v_tenant FROM public.festival_calendar f WHERE f.id=p_festival_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Festival not found.' USING ERRCODE='P0002'; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND
      (p.is_superadmin IS TRUE OR p.role='super_admin' OR
       (p.role IN ('admin','tenant_admin','festival_admin') AND p.tenant_id=v_tenant))
  ) THEN RAISE EXCEPTION 'Administrator access to this festival is required.' USING ERRCODE='42501'; END IF;
  RETURN v_tenant;
END $function$;
ALTER FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.guard_final_chest_numbers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_festival uuid; v_other uuid;
BEGIN
  IF TG_TABLE_NAME='festival_calendar' THEN
    IF OLD.chest_number_template IS NOT DISTINCT FROM NEW.chest_number_template AND
       OLD.chest_number_category_range IS NOT DISTINCT FROM NEW.chest_number_category_range THEN RETURN NEW; END IF;
    v_festival:=OLD.id;
  ELSIF TG_TABLE_NAME='participants' THEN
    IF OLD.chest_number IS NOT DISTINCT FROM NEW.chest_number AND
       OLD.organisation_id IS NOT DISTINCT FROM NEW.organisation_id AND
       OLD.festival_id IS NOT DISTINCT FROM NEW.festival_id THEN RETURN NEW; END IF;
    v_festival:=OLD.festival_id; v_other:=NEW.festival_id;
  ELSIF TG_OP='DELETE' THEN v_festival:=OLD.festival_id;
  ELSE v_festival:=NEW.festival_id;
  END IF;
  -- Allow the existing ON DELETE CASCADE when the festival itself is removed.
  IF TG_TABLE_NAME='festival_team_chest_slots' AND TG_OP='DELETE' AND
     NOT EXISTS (SELECT 1 FROM public.festival_calendar f WHERE f.id=v_festival) THEN RETURN OLD; END IF;
  -- Deterministic order also covers a direct cross-festival participant update.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(f.id::text),pg_catalog.hashtext('participant-chest-number'))
    FROM public.festival_calendar f WHERE f.id IN (v_festival,v_other) ORDER BY f.id;
  IF EXISTS (SELECT 1 FROM public.festival_chest_number_controls c
             WHERE c.festival_id IN (v_festival,v_other) AND c.locked) THEN
    RAISE EXCEPTION 'Chest numbers are finally locked. Unlock with the tenant ID before changing them.' USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION "public"."guard_final_chest_numbers"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_festival_chest_order(p_festival_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  SELECT jsonb_build_object('festival_id',f.id,'template',f.chest_number_template,
    'range',f.chest_number_category_range,'locked',COALESCE(c.locked,false),'revision',COALESCE(c.revision,0),
    'teams',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'archived_at',r.archived_at,
        'slot_number',r.slot_number,'total',r.total,'numeric',r.numeric)
        ORDER BY r.slot_number NULLS LAST,r.created_at,r.id)
      FROM (
        SELECT o.id,o.name,o.archived_at,o.created_at,s.slot_number,
          COALESCE(p.total,0) AS total,COALESCE(p.numeric,0) AS numeric
        FROM public.tenants t JOIN public.organisations o ON o.parent_id=t.organisation_id
        LEFT JOIN public.festival_team_chest_slots s ON s.festival_id=f.id AND s.organisation_id=o.id
        LEFT JOIN (
          SELECT p.organisation_id,count(*) AS total,
            count(*) FILTER (WHERE p.chest_number ~ '^[0-9]+$') AS numeric
          FROM public.participants p WHERE p.festival_id=p_festival_id GROUP BY p.organisation_id
        ) p ON p.organisation_id=o.id
        WHERE t.id=f.tenant_id
      ) r
    ),'[]'::jsonb)) INTO v_result
  FROM public.festival_calendar f
  LEFT JOIN public.festival_chest_number_controls c ON c.festival_id=f.id
  WHERE f.id=p_festival_id;
  RETURN v_result;
END $function$;
ALTER FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.save_festival_chest_order(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
  v_state jsonb;
  v_current uuid[];
  v_active_slots integer[];
  v_active_count integer;
BEGIN
  v_tenant:=public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  -- Serialize this save with archive/restore updates to the team rows.
  PERFORM o.id
  FROM public.tenants t
  JOIN public.organisations o ON o.parent_id=t.organisation_id
  WHERE t.id=v_tenant
  ORDER BY o.id
  FOR UPDATE OF o;

  v_state:=public.get_festival_chest_order(p_festival_id);
  IF v_state->>'template'<>'team' THEN RAISE EXCEPTION 'Team ordering requires the team chest-number template.'; END IF;
  IF (v_state->>'locked')::boolean THEN RAISE EXCEPTION 'Chest numbers are finally locked.' USING ERRCODE='55000'; END IF;
  SELECT COALESCE(array_agg((e.value->>'id')::uuid ORDER BY e.ordinality),'{}'::uuid[]) INTO v_current
    FROM jsonb_array_elements(v_state->'teams') WITH ORDINALITY AS e(value,ordinality);
  IF (v_state->>'revision')::integer IS DISTINCT FROM p_expected_revision OR
     (v_state->>'range')::integer IS DISTINCT FROM p_expected_range OR v_current IS DISTINCT FROM p_expected_team_ids THEN
    RAISE EXCEPTION 'Chest-number settings or teams changed. Reload before saving.' USING ERRCODE='40001';
  END IF;
  IF p_team_ids IS NULL OR cardinality(p_team_ids)<>cardinality(v_current) OR
     (SELECT count(DISTINCT x.id) FROM unnest(p_team_ids) AS x(id))<>cardinality(v_current) OR
     EXISTS (SELECT 1 FROM unnest(p_team_ids) AS x(id) WHERE x.id IS NULL OR NOT x.id=ANY(v_current)) THEN
    RAISE EXCEPTION 'Include every festival team exactly once.';
  END IF;

  PERFORM public.ensure_festival_team_chest_slots(p_festival_id);
  SELECT count(*)::integer INTO v_active_count
  FROM public.organisations o
  JOIN public.tenants t ON t.organisation_id=o.parent_id
  WHERE t.id=v_tenant AND o.archived_at IS NULL;
  SELECT COALESCE(array_agg(s.slot_number ORDER BY s.slot_number),'{}'::integer[])
    INTO v_active_slots
  FROM public.festival_team_chest_slots s
  JOIN public.organisations o ON o.id=s.organisation_id
  JOIN public.tenants t ON t.organisation_id=o.parent_id
  WHERE s.festival_id=p_festival_id AND t.id=v_tenant AND o.archived_at IS NULL;
  IF cardinality(v_active_slots)<>v_active_count THEN
    RAISE EXCEPTION 'Stored active team slots are inconsistent. Review team ownership first.';
  END IF;

  DELETE FROM public.festival_team_chest_slots s
  USING public.organisations o,public.tenants t
  WHERE s.festival_id=p_festival_id AND s.organisation_id=o.id
    AND o.parent_id=t.organisation_id AND t.id=v_tenant AND o.archived_at IS NULL;
  WITH active_order AS (
    SELECT x.id,row_number() OVER (ORDER BY x.ordinality)::integer AS active_position
    FROM unnest(p_team_ids) WITH ORDINALITY AS x(id,ordinality)
    JOIN public.organisations o ON o.id=x.id
    WHERE o.parent_id=(SELECT t.organisation_id FROM public.tenants t WHERE t.id=v_tenant)
      AND o.archived_at IS NULL
  )
  INSERT INTO public.festival_team_chest_slots(festival_id,organisation_id,slot_number)
  SELECT p_festival_id,a.id,v_active_slots[a.active_position]
  FROM active_order a;

  -- Existing two-phase regeneration preserves festival-wide uniqueness and
  -- audit records. Failure rolls back active slots, numbers and revision.
  PERFORM public.regenerate_festival_chest_numbers_internal(p_festival_id,auth.uid());
  INSERT INTO public.festival_chest_number_controls(festival_id,revision,updated_by)
    VALUES(p_festival_id,1,auth.uid()) ON CONFLICT (festival_id) DO UPDATE
    SET revision=festival_chest_number_controls.revision+1,updated_by=auth.uid(),updated_at=now();
  RETURN public.get_festival_chest_order(p_festival_id);
END $function$;
ALTER FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.set_festival_chest_lock(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid; v_state jsonb; v_current uuid[];
BEGIN
  v_tenant:=public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  v_state:=public.get_festival_chest_order(p_festival_id);
  IF p_locked IS NULL THEN RAISE EXCEPTION 'Choose lock or unlock.'; END IF;
  IF (v_state->>'revision')::integer IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Chest-number settings changed. Reload before continuing.' USING ERRCODE='40001'; END IF;
  IF NOT p_locked AND lower(btrim(COALESCE(p_unlock_code,''))) IS DISTINCT FROM v_tenant::text THEN
    RAISE EXCEPTION 'Incorrect unlock code.' USING ERRCODE='42501'; END IF;
  IF p_locked THEN
    SELECT COALESCE(array_agg((e.value->>'id')::uuid ORDER BY e.ordinality),'{}'::uuid[]) INTO v_current
      FROM jsonb_array_elements(v_state->'teams') WITH ORDINALITY AS e(value,ordinality);
    IF v_state->>'template'<>'team' OR (v_state->>'range')::integer IS DISTINCT FROM p_expected_range OR
       v_current IS DISTINCT FROM p_expected_team_ids THEN
      RAISE EXCEPTION 'Chest-number settings or teams changed. Reload before locking.' USING ERRCODE='40001'; END IF;
    IF NOT (v_state->>'locked')::boolean THEN
      PERFORM public.ensure_festival_team_chest_slots(p_festival_id);
      IF EXISTS (SELECT 1 FROM public.participants p
        LEFT JOIN public.festival_team_chest_slots s ON s.festival_id=p.festival_id AND s.organisation_id=p.organisation_id
        WHERE p.festival_id=p_festival_id AND (s.slot_number IS NULL OR p.chest_number IS NULL OR
          CASE WHEN p.chest_number ~ '^[0-9]+$' THEN
            p.chest_number::numeric < s.slot_number*p_expected_range::numeric OR
            p.chest_number::numeric >= (s.slot_number+1)*p_expected_range::numeric ELSE true END)) THEN
        RAISE EXCEPTION 'Generate valid team chest numbers before final locking.';
      END IF;
    END IF;
  END IF;
  IF (v_state->>'locked')::boolean IS NOT DISTINCT FROM p_locked THEN RETURN v_state; END IF;
  INSERT INTO public.festival_chest_number_controls(festival_id,locked,revision,updated_by)
    VALUES(p_festival_id,p_locked,1,auth.uid()) ON CONFLICT (festival_id) DO UPDATE
    SET locked=p_locked,revision=festival_chest_number_controls.revision+1,updated_by=auth.uid(),updated_at=now();
  RETURN public.get_festival_chest_order(p_festival_id);
END $function$;
ALTER FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_general_team_roster(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_entry public.registrations%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_festival_tenant uuid;
  v_old_ids uuid[];
  v_expected_ids uuid[];
  v_new_ids uuid[];
  v_count integer;
  v_names jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only an administrator can edit a General team roster.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_entry FROM public.registrations WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR v_entry.entry_kind IS DISTINCT FROM 'general_team' THEN
    RAISE EXCEPTION 'General team entry not found.' USING ERRCODE='P0002';
  END IF;
  SELECT tenant_id INTO v_festival_tenant FROM public.festival_calendar WHERE id=v_entry.festival_id;
  IF v_festival_tenant IS NULL OR (v_actor.is_superadmin IS NOT TRUE
    AND v_actor.tenant_id IS DISTINCT FROM v_festival_tenant) THEN
    RAISE EXCEPTION 'This entry is outside your tenant.' USING ERRCODE='42501';
  END IF;
  IF v_actor.is_superadmin IS NOT TRUE AND NOT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(v_actor.tenant_id) visible
    WHERE visible.id=v_entry.organisation_id
  ) THEN
    RAISE EXCEPTION 'This team is outside your organisation scope.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_item FROM public.items WHERE id=v_entry.item_id
    AND festival_id=v_entry.festival_id AND tenant_id=v_festival_tenant;
  IF NOT FOUND OR v_item.participation_type IS DISTINCT FROM 'group'
    OR cardinality(v_item.category_codes) IS DISTINCT FROM 1
 THEN
    RAISE EXCEPTION 'This entry no longer belongs to a General group competition.';
  END IF;

  SELECT COALESCE(array_agg(gm.participant_id ORDER BY gm.participant_id),ARRAY[]::uuid[])
    INTO v_old_ids FROM public.group_members gm WHERE gm.registration_id=v_entry.id;
  SELECT COALESCE(array_agg(id ORDER BY id),ARRAY[]::uuid[])
    INTO v_expected_ids FROM unnest(p_expected_participant_ids) ids(id);
  IF p_expected_participant_ids IS NULL OR v_expected_ids IS DISTINCT FROM v_old_ids THEN
    RAISE EXCEPTION 'This roster changed. Reload before saving.' USING ERRCODE='40001';
  END IF;
  IF p_participant_ids IS NULL OR cardinality(p_participant_ids)=0
    OR array_position(p_participant_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Select the team members before saving.';
  END IF;
  v_count:=cardinality(p_participant_ids);
  IF (SELECT count(DISTINCT member_id) FROM unnest(p_participant_ids) ids(member_id))<>v_count THEN
    RAISE EXCEPTION 'A participant can only be selected once for this entry.';
  END IF;
  IF COALESCE(v_item.group_min_members,0)<1
    OR v_count<v_item.group_min_members
    OR (COALESCE(v_item.group_max_members,0)>0 AND v_count>v_item.group_max_members) THEN
    RAISE EXCEPTION 'The selected team size is outside this competition''s configured member range.';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO v_new_ids FROM unnest(p_participant_ids) ids(id);
  IF v_new_ids=v_old_ids THEN
    RETURN jsonb_build_object('registration_id',v_entry.id,'entry_chest_number',v_entry.entry_chest_number,
      'member_count',v_count,'changed',false);
  END IF;

  IF (SELECT count(*) FROM public.participants p WHERE p.id=ANY(v_new_ids)
    AND p.festival_id=v_entry.festival_id AND p.organisation_id=v_entry.organisation_id
    AND p.status IS DISTINCT FROM 'rejected'

    AND (COALESCE(lower(btrim(v_item.gender)),'both') IN ('','both')
      OR lower(btrim(COALESCE(p.gender,'')))=lower(btrim(v_item.gender))))<>v_count THEN
    RAISE EXCEPTION 'All members must be eligible participants from this festival and team.';
  END IF;

  INSERT INTO group_entry_private.member_edit_authorizations(transaction_id,registration_id,actor_id)
    VALUES(pg_catalog.txid_current(),v_entry.id,auth.uid());
  DELETE FROM public.group_members gm WHERE gm.registration_id=v_entry.id
    AND NOT (gm.participant_id=ANY(v_new_ids));
  INSERT INTO public.group_members(registration_id,participant_id)
    SELECT v_entry.id, ids.member_id FROM unnest(v_new_ids) ids(member_id)
    WHERE NOT EXISTS(SELECT 1 FROM public.group_members gm
      WHERE gm.registration_id=v_entry.id AND gm.participant_id=ids.member_id);
  SELECT jsonb_agg(p.name ORDER BY p.chest_number NULLS LAST,p.name,p.id)
    INTO v_names FROM public.participants p WHERE p.id=ANY(v_new_ids);
  UPDATE public.registrations SET raw_group_members=v_names WHERE id=v_entry.id;
  DELETE FROM group_entry_private.member_edit_authorizations
    WHERE transaction_id=pg_catalog.txid_current();

  INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES(v_entry.tenant_id,auth.uid(),'general_team_roster_edit','registrations',v_entry.id,
      jsonb_build_object('member_ids',v_old_ids),jsonb_build_object('member_ids',v_new_ids));
  RETURN jsonb_build_object('registration_id',v_entry.id,'entry_chest_number',v_entry.entry_chest_number,
    'member_count',v_count,'changed',true);
END $function$;
ALTER FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.chest_number(p_entry registrations)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE((SELECT p.chest_number FROM public.participants p
    WHERE p.id=p_entry.group_leader_participant_id AND p.festival_id=p_entry.festival_id
      AND p.organisation_id=p_entry.organisation_id), p_entry.entry_chest_number);
$function$;
ALTER FUNCTION "group_entry_private"."chest_number"(p_entry registrations) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.category_code(p_entry registrations)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT i.category_codes[1] FROM public.items i WHERE i.id=p_entry.item_id AND i.festival_id=p_entry.festival_id;
$function$;
ALTER FUNCTION "group_entry_private"."category_code"(p_entry registrations) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.display_name(p_entry registrations)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE((SELECT p.name FROM public.participants p
    WHERE p.id=p_entry.group_leader_participant_id AND p.festival_id=p_entry.festival_id
      AND p.organisation_id=p_entry.organisation_id),
    (SELECT o.name FROM public.organisations o WHERE o.id=p_entry.organisation_id), 'Group entry');
$function$;
ALTER FUNCTION "group_entry_private"."display_name"(p_entry registrations) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.guard_leader_team_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (NEW.festival_id,NEW.organisation_id) IS DISTINCT FROM (OLD.festival_id,OLD.organisation_id)
    AND EXISTS (SELECT 1 FROM public.registrations r WHERE r.group_leader_participant_id=OLD.id) THEN
    RAISE EXCEPTION 'Choose another group leader before moving this participant to another team or festival.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $function$;
ALTER FUNCTION "group_entry_private"."guard_leader_team_move"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.ensure_leader_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid; v_entry public.registrations;
BEGIN
  IF TG_TABLE_NAME='registrations' THEN v_id:=NEW.id;
  ELSIF TG_OP='DELETE' THEN v_id:=OLD.registration_id;
  ELSE v_id:=NEW.registration_id; END IF;
  SELECT * INTO v_entry FROM public.registrations WHERE id=v_id;
  IF v_entry.group_leader_participant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.group_members gm WHERE gm.registration_id=v_id
      AND gm.participant_id=v_entry.group_leader_participant_id) THEN
    RAISE EXCEPTION 'The team leader must be included in the group roster.' USING ERRCODE='23514';
  END IF;
  IF v_entry.group_leader_participant_id IS NOT NULL THEN
    PERFORM group_entry_private.validate_roster(v_entry.festival_id,v_entry.item_id,v_entry.organisation_id,
      ARRAY(SELECT gm.participant_id FROM public.group_members gm WHERE gm.registration_id=v_id));
  END IF;
  RETURN NULL;
END $function$;
ALTER FUNCTION "group_entry_private"."ensure_leader_membership"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.validate_roster(p_festival uuid, p_item uuid, p_org uuid, p_members uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_item public.items; v_count integer;
BEGIN
  SELECT * INTO v_item FROM public.items WHERE id=p_item AND festival_id=p_festival;
  IF NOT FOUND OR v_item.participation_type IS DISTINCT FROM 'group'
    OR pg_catalog.cardinality(v_item.category_codes) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Select a single-category group competition.' USING ERRCODE='23514';
  END IF;
  v_count:=pg_catalog.cardinality(p_members);
  IF p_members IS NULL OR v_count=0 OR pg_catalog.array_position(p_members,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT x) FROM pg_catalog.unnest(p_members) x)<>v_count THEN
    RAISE EXCEPTION 'Select unique group members.' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM public.participants p JOIN public.organisations o ON o.id=p.organisation_id
    JOIN public.festival_calendar f ON f.id=p.festival_id
    WHERE p.id=ANY(p_members) AND p.festival_id=p_festival AND p.organisation_id=p_org
      AND p.tenant_id IN(f.tenant_id,o.tenant_id) AND p.status IS DISTINCT FROM 'rejected'
      AND (p.plagiarism_ban_until IS NULL OR p.plagiarism_ban_until<=CURRENT_DATE)
      AND NOT (COALESCE((pg_catalog.to_jsonb(p)->>'is_post_hs_religious')::boolean,false)
        AND EXISTS (SELECT 1 FROM pg_catalog.unnest(v_item.category_codes) c WHERE pg_catalog.upper(pg_catalog.btrim(c))='HS'))
      AND NOT EXISTS (SELECT 1 FROM public.registrations other_entry
        LEFT JOIN public.group_members other_member ON other_member.registration_id=other_entry.id
        WHERE other_entry.festival_id=p_festival AND other_entry.organisation_id IS DISTINCT FROM p_org
          AND (other_entry.participant_id=p.id OR other_member.participant_id=p.id))
      AND (COALESCE(pg_catalog.lower(pg_catalog.btrim(v_item.gender)),'both') IN ('','both')
        OR pg_catalog.lower(pg_catalog.btrim(p.gender))=pg_catalog.lower(pg_catalog.btrim(v_item.gender)))
      AND (v_item.category_codes && ARRAY['GN','GENERAL']
      OR (COALESCE((pg_catalog.to_jsonb(p)->>'is_post_hs_religious')::boolean,false) AND EXISTS (
        SELECT 1 FROM pg_catalog.unnest(v_item.category_codes) c WHERE pg_catalog.upper(pg_catalog.btrim(c)) IN ('JR','JUNIOR','SR','SENIOR')))
      OR EXISTS (
        SELECT 1 FROM pg_catalog.unnest(v_item.category_codes) c WHERE
          CASE pg_catalog.upper(pg_catalog.btrim(c)) WHEN 'JUNIOR' THEN 'JR' WHEN 'SENIOR' THEN 'SR' WHEN 'CAMPUS' THEN 'CA' ELSE pg_catalog.upper(pg_catalog.btrim(c)) END
          = CASE pg_catalog.upper(pg_catalog.btrim(p.category_code)) WHEN 'JUNIOR' THEN 'JR' WHEN 'SENIOR' THEN 'SR' WHEN 'CAMPUS' THEN 'CA' ELSE pg_catalog.upper(pg_catalog.btrim(p.category_code)) END
      )))<>v_count THEN
    RAISE EXCEPTION 'All members must be eligible participants from this festival and team.' USING ERRCODE='23514';
  END IF;
END $function$;
ALTER FUNCTION "group_entry_private"."validate_roster"(p_festival uuid, p_item uuid, p_org uuid, p_members uuid[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION group_entry_private.create_entry(p_festival uuid, p_item uuid, p_org uuid, p_members uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_festival public.festival_calendar; v_item public.items; v_id uuid; v_names jsonb; v_leader uuid;
BEGIN
  SELECT * INTO v_festival FROM public.festival_calendar WHERE id=p_festival AND is_active IS TRUE;
  SELECT * INTO v_item FROM public.items WHERE id=p_item AND festival_id=p_festival
    AND tenant_id=v_festival.tenant_id AND is_active IS TRUE FOR SHARE;
  IF v_festival.id IS NULL OR v_item.id IS NULL THEN RAISE EXCEPTION 'Select an active competition in this festival.'; END IF;
  IF v_item.category_codes && ARRAY['GN','GENERAL'] AND v_festival.general_category_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'General category is disabled for this festival.' USING ERRCODE='23514';
  END IF;
  PERFORM group_entry_private.validate_roster(p_festival,p_item,p_org,p_members);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group:'||p_festival::text||':'||p_item::text||':'||p_org::text,0));
  IF EXISTS (SELECT 1 FROM public.registrations r WHERE r.festival_id=p_festival AND r.item_id=p_item AND r.organisation_id=p_org) THEN
    RAISE EXCEPTION 'This team already has entries for this group competition. Edit the existing roster; legacy entries require review.' USING ERRCODE='23505';
  END IF;
  v_leader:=p_members[1];
  SELECT pg_catalog.jsonb_agg(p.name ORDER BY m.position) INTO v_names
    FROM pg_catalog.unnest(p_members) WITH ORDINALITY m(id,position) JOIN public.participants p ON p.id=m.id;
  v_id:=pg_catalog.gen_random_uuid();
  INSERT INTO group_entry_private.member_edit_authorizations(transaction_id,registration_id,actor_id)
    VALUES(pg_catalog.txid_current(),v_id,auth.uid());
  INSERT INTO public.registrations(id,tenant_id,festival_id,item_id,participant_id,organisation_id,
    status,is_group_registration,entry_kind,group_leader_participant_id,raw_group_members)
  VALUES(v_id,v_festival.tenant_id,p_festival,p_item,NULL,p_org,'approved',true,'general_team',v_leader,v_names)
  RETURNING id INTO v_id;
  INSERT INTO public.group_members(registration_id,participant_id,member_order)
    SELECT v_id,m.id,m.position::integer FROM pg_catalog.unnest(p_members) WITH ORDINALITY m(id,position);
  DELETE FROM group_entry_private.member_edit_authorizations WHERE transaction_id=pg_catalog.txid_current();
  RETURN pg_catalog.jsonb_build_object('registration_id',v_id,'organisation_id',p_org,
    'leader_participant_id',v_leader,'entry_chest_number',(SELECT chest_number FROM public.participants WHERE id=v_leader),
    'member_count',pg_catalog.cardinality(p_members));
END $function$;
ALTER FUNCTION "group_entry_private"."create_entry"(p_festival uuid, p_item uuid, p_org uuid, p_members uuid[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.update_group_team_roster(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor public.profiles; v_entry public.registrations; v_owner uuid; v_old uuid[]; v_expected uuid[]; v_names jsonb;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid();
  SELECT * INTO v_entry FROM public.registrations WHERE id=p_registration_id FOR UPDATE;
  SELECT tenant_id INTO v_owner FROM public.festival_calendar WHERE id=v_entry.festival_id;
  IF v_actor.id IS NULL OR (v_actor.role IS DISTINCT FROM 'admin' AND v_actor.is_superadmin IS NOT TRUE)
    OR v_owner IS NULL OR (v_actor.is_superadmin IS NOT TRUE AND v_actor.tenant_id IS DISTINCT FROM v_owner)
    OR (v_actor.is_superadmin IS NOT TRUE AND NOT EXISTS (
      SELECT 1 FROM public.get_visible_organisations(v_actor.tenant_id) o WHERE o.id=v_entry.organisation_id)) THEN
    RAISE EXCEPTION 'Administrator access to this team is required.' USING ERRCODE='42501';
  END IF;
  IF v_entry.entry_kind IS DISTINCT FROM 'general_team' THEN RAISE EXCEPTION 'Group entry not found.'; END IF;
  SELECT COALESCE(pg_catalog.array_agg(participant_id ORDER BY participant_id),'{}'::uuid[]) INTO v_old
    FROM public.group_members WHERE registration_id=v_entry.id;
  SELECT COALESCE(pg_catalog.array_agg(x ORDER BY x),'{}'::uuid[]) INTO v_expected FROM pg_catalog.unnest(p_expected_participant_ids) x;
  IF p_expected_participant_ids IS NULL OR v_old IS DISTINCT FROM v_expected
    OR v_entry.group_leader_participant_id IS DISTINCT FROM p_expected_leader_participant_id THEN
    RAISE EXCEPTION 'This roster changed. Reload before saving.' USING ERRCODE='40001';
  END IF;
  PERFORM group_entry_private.validate_roster(v_entry.festival_id,v_entry.item_id,v_entry.organisation_id,p_participant_ids);
  IF p_leader_participant_id IS NULL OR NOT (p_leader_participant_id=ANY(p_participant_ids)) THEN
    RAISE EXCEPTION 'Select a team leader from the current members.' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group:'||v_entry.festival_id::text||':'||v_entry.item_id::text||':'||v_entry.organisation_id::text,0));
  IF EXISTS (SELECT 1 FROM public.registrations r WHERE r.festival_id=v_entry.festival_id AND r.item_id=v_entry.item_id
    AND r.organisation_id=v_entry.organisation_id AND r.id<>v_entry.id) THEN
    RAISE EXCEPTION 'This team has multiple historical entries. Review the conflict before choosing a leader.' USING ERRCODE='23505';
  END IF;
  INSERT INTO group_entry_private.member_edit_authorizations(transaction_id,registration_id,actor_id)
    VALUES(pg_catalog.txid_current(),v_entry.id,auth.uid());
  DELETE FROM public.group_members WHERE registration_id=v_entry.id AND NOT (participant_id=ANY(p_participant_ids));
  INSERT INTO public.group_members(registration_id,participant_id,member_order)
    SELECT v_entry.id,m.id,m.position::integer FROM pg_catalog.unnest(p_participant_ids) WITH ORDINALITY m(id,position)
    WHERE NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.registration_id=v_entry.id AND gm.participant_id=m.id);
  SELECT pg_catalog.jsonb_agg(p.name ORDER BY m.position) INTO v_names
    FROM pg_catalog.unnest(p_participant_ids) WITH ORDINALITY m(id,position) JOIN public.participants p ON p.id=m.id;
  UPDATE public.registrations SET group_leader_participant_id=p_leader_participant_id,raw_group_members=v_names WHERE id=v_entry.id;
  DELETE FROM group_entry_private.member_edit_authorizations WHERE transaction_id=pg_catalog.txid_current();
  INSERT INTO public.audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
    VALUES(v_owner,auth.uid(),'group_roster_edit','registrations',v_entry.id,
      pg_catalog.jsonb_build_object('member_ids',v_old,'leader_id',v_entry.group_leader_participant_id),
      pg_catalog.jsonb_build_object('member_ids',p_participant_ids,'leader_id',p_leader_participant_id));
  RETURN pg_catalog.jsonb_build_object('registration_id',v_entry.id,'member_count',pg_catalog.cardinality(p_participant_ids),
    'leader_participant_id',p_leader_participant_id,'entry_chest_number',(SELECT chest_number FROM public.participants WHERE id=p_leader_participant_id),'changed',true);
END $function$;
ALTER FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) OWNER TO "postgres";

-- Constraints
ALTER TABLE "group_entry_private"."member_edit_authorizations" ADD CONSTRAINT "member_edit_authorizations_pkey" PRIMARY KEY (transaction_id);

ALTER TABLE "public"."festival_calendar" ADD CONSTRAINT "festival_calendar_gender_mode_check" CHECK ((gender_mode = ANY (ARRAY['boys_only'::text, 'girls_only'::text, 'both'::text])));

ALTER TABLE "public"."festival_calendar" ADD CONSTRAINT "festival_chest_number_template_check" CHECK ((chest_number_template = ANY (ARRAY['category'::text, 'team'::text])));

ALTER TABLE "public"."festival_chest_number_controls" ADD CONSTRAINT "festival_chest_number_controls_pkey" PRIMARY KEY (festival_id);

ALTER TABLE "public"."festival_chest_number_controls" ADD CONSTRAINT "festival_chest_number_controls_revision_check" CHECK ((revision >= 0));

ALTER TABLE "public"."festival_team_chest_slots" ADD CONSTRAINT "festival_team_chest_slots_festival_id_slot_number_key" UNIQUE (festival_id, slot_number);

ALTER TABLE "public"."festival_team_chest_slots" ADD CONSTRAINT "festival_team_chest_slots_pkey" PRIMARY KEY (festival_id, organisation_id);

ALTER TABLE "public"."festival_team_chest_slots" ADD CONSTRAINT "festival_team_chest_slots_slot_number_check" CHECK ((slot_number > 0));

ALTER TABLE "public"."general_entry_number_counters" ADD CONSTRAINT "general_entry_number_counters_next_number_check" CHECK ((next_number > 0));

ALTER TABLE "public"."general_entry_number_counters" ADD CONSTRAINT "general_entry_number_counters_pkey" PRIMARY KEY (festival_id);

ALTER TABLE "public"."general_entry_number_counters" ADD CONSTRAINT "general_entry_number_counters_tenant_id_festival_id_key" UNIQUE (tenant_id, festival_id);

ALTER TABLE "public"."grace_submissions" ADD CONSTRAINT "grace_submissions_festival_id_config_version_revision_key" UNIQUE (festival_id, config_version, revision);

ALTER TABLE "public"."grace_submissions" ADD CONSTRAINT "grace_submissions_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."grace_workspaces" ADD CONSTRAINT "grace_workspaces_pkey" PRIMARY KEY (festival_id);

ALTER TABLE "public"."participant_chest_number_changes" ADD CONSTRAINT "participant_chest_number_changes_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."points_config" DROP CONSTRAINT "points_config_rule12_behavior_check";
ALTER TABLE "public"."points_config" ADD CONSTRAINT "points_config_rule12_behavior_check" CHECK (((NOT COALESCE(less_than_3_teams_rule, false)) OR ((rule12_behavior IS NOT NULL) AND (rule12_behavior = ANY (ARRAY['grade_only'::text, 'rank_and_grade'::text, 'no_points'::text])))));

ALTER TABLE "public"."points_config" DROP CONSTRAINT "points_config_rule12_min_teams_check";
ALTER TABLE "public"."points_config" ADD CONSTRAINT "points_config_rule12_min_teams_check" CHECK (((NOT COALESCE(less_than_3_teams_rule, false)) OR ((rule12_min_teams IS NOT NULL) AND (rule12_min_teams >= 1))));

ALTER TABLE "public"."program_intake_statuses" ADD CONSTRAINT "program_intake_status_category_not_blank" CHECK ((btrim(category_code) <> ''::text));

ALTER TABLE "public"."program_intake_statuses" ADD CONSTRAINT "program_intake_statuses_entry_kind_check" CHECK ((entry_kind = ANY (ARRAY['participant'::text, 'general_team'::text])));

ALTER TABLE "public"."program_intake_statuses" ADD CONSTRAINT "program_intake_statuses_pkey" PRIMARY KEY (festival_id, item_id, category_code, entry_kind);

ALTER TABLE "public"."registrations" ADD CONSTRAINT "group_leader_entry_kind_check" CHECK (((group_leader_participant_id IS NULL) OR (entry_kind = 'general_team'::text)));

ALTER TABLE "public"."registrations" ADD CONSTRAINT "registrations_entry_kind_check" CHECK ((entry_kind = ANY (ARRAY['participant'::text, 'general_team'::text])));

ALTER TABLE "public"."registrations" ADD CONSTRAINT "registrations_fixed_letter_valid" CHECK (((NOT code_letter_fixed) OR ((code_letter IS NOT NULL) AND (code_letter ~ '^[A-Z]$'::text))));

ALTER TABLE "public"."registrations" ADD CONSTRAINT "registrations_general_team_identity_check" CHECK (((entry_kind <> 'general_team'::text) OR ((participant_id IS NULL) AND (organisation_id IS NOT NULL))));

ALTER TABLE "public"."scoring_publications" ADD CONSTRAINT "scoring_publications_pkey" PRIMARY KEY (id);

ALTER TABLE "stage_portal_private"."pin_attempts" ADD CONSTRAINT "pin_attempts_pkey" PRIMARY KEY (venue_id, attempt_key);

ALTER TABLE "stage_portal_private"."venue_access_codes" ADD CONSTRAINT "venue_access_codes_festival_id_pin_key" UNIQUE (festival_id, pin);

ALTER TABLE "stage_portal_private"."venue_access_codes" ADD CONSTRAINT "venue_access_codes_pin_check" CHECK ((pin ~ '^[0-9]{4}$'::text));

ALTER TABLE "stage_portal_private"."venue_access_codes" ADD CONSTRAINT "venue_access_codes_pkey" PRIMARY KEY (venue_id);

ALTER TABLE "public"."festival_chest_number_controls" ADD CONSTRAINT "festival_chest_number_controls_festival_id_fkey" FOREIGN KEY (festival_id) REFERENCES festival_calendar(id) ON DELETE CASCADE;

ALTER TABLE "public"."festival_team_chest_slots" ADD CONSTRAINT "festival_team_chest_slots_festival_id_fkey" FOREIGN KEY (festival_id) REFERENCES festival_calendar(id) ON DELETE CASCADE;

ALTER TABLE "public"."festival_team_chest_slots" ADD CONSTRAINT "festival_team_chest_slots_organisation_id_fkey" FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE;

ALTER TABLE "public"."general_entry_number_counters" ADD CONSTRAINT "general_entry_number_counters_festival_id_fkey" FOREIGN KEY (festival_id) REFERENCES festival_calendar(id) ON DELETE CASCADE;

ALTER TABLE "public"."general_entry_number_counters" ADD CONSTRAINT "general_entry_number_counters_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."grace_marks" ADD CONSTRAINT "grace_marks_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES grace_submissions(id);

ALTER TABLE "public"."grace_submissions" ADD CONSTRAINT "grace_submissions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE "public"."grace_submissions" ADD CONSTRAINT "grace_submissions_festival_id_fkey" FOREIGN KEY (festival_id) REFERENCES festival_calendar(id);

ALTER TABLE "public"."grace_submissions" ADD CONSTRAINT "grace_submissions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);

ALTER TABLE "public"."grace_workspaces" ADD CONSTRAINT "grace_workspaces_festival_id_fkey" FOREIGN KEY (festival_id) REFERENCES festival_calendar(id);

ALTER TABLE "public"."grace_workspaces" ADD CONSTRAINT "grace_workspaces_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);

ALTER TABLE "public"."grace_workspaces" ADD CONSTRAINT "grace_workspaces_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);

ALTER TABLE "public"."participant_chest_number_changes" ADD CONSTRAINT "participant_chest_number_changes_festival_id_fkey" FOREIGN KEY (festival_id) REFERENCES festival_calendar(id) ON DELETE CASCADE;

ALTER TABLE "public"."participant_chest_number_changes" ADD CONSTRAINT "participant_chest_number_changes_participant_id_fkey" FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE;

ALTER TABLE "public"."participant_chest_number_changes" ADD CONSTRAINT "participant_chest_number_changes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."program_intake_statuses" ADD CONSTRAINT "program_intake_statuses_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."program_intake_statuses" ADD CONSTRAINT "program_intake_statuses_festival_id_fkey" FOREIGN KEY (festival_id) REFERENCES festival_calendar(id) ON DELETE CASCADE;

ALTER TABLE "public"."program_intake_statuses" ADD CONSTRAINT "program_intake_statuses_item_id_fkey" FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;

ALTER TABLE "public"."program_intake_statuses" ADD CONSTRAINT "program_intake_statuses_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."registrations" ADD CONSTRAINT "registrations_group_leader_participant_id_fkey" FOREIGN KEY (group_leader_participant_id) REFERENCES participants(id) ON DELETE RESTRICT;

ALTER TABLE "public"."scoring_publications" ADD CONSTRAINT "scoring_publications_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE "public"."scoring_publications" ADD CONSTRAINT "scoring_publications_festival_id_fkey" FOREIGN KEY (festival_id) REFERENCES festival_calendar(id);

ALTER TABLE "public"."scoring_publications" ADD CONSTRAINT "scoring_publications_item_id_fkey" FOREIGN KEY (item_id) REFERENCES items(id);

ALTER TABLE "public"."scoring_publications" ADD CONSTRAINT "scoring_publications_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES schedules(id);

ALTER TABLE "public"."scoring_publications" ADD CONSTRAINT "scoring_publications_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);

ALTER TABLE "stage_portal_private"."pin_attempts" ADD CONSTRAINT "pin_attempts_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;

ALTER TABLE "stage_portal_private"."venue_access_codes" ADD CONSTRAINT "venue_access_codes_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;

-- Non-constraint indexes
CREATE INDEX festival_team_chest_slots_organisation_idx ON public.festival_team_chest_slots USING btree (organisation_id);

CREATE INDEX general_group_members_participant_idx ON public.group_members USING btree (participant_id, registration_id);

CREATE INDEX general_group_members_registration_idx ON public.group_members USING btree (registration_id, participant_id);

CREATE INDEX grace_submissions_scope ON public.grace_submissions USING btree (tenant_id, festival_id);

CREATE INDEX group_entry_leader_lookup ON public.registrations USING btree (group_leader_participant_id) WHERE (group_leader_participant_id IS NOT NULL);

CREATE UNIQUE INDEX group_team_entry_one_per_item ON public.registrations USING btree (festival_id, item_id, organisation_id) WHERE ((entry_kind = 'general_team'::text) AND (group_leader_participant_id IS NOT NULL));

CREATE INDEX participant_chest_number_changes_participant_idx ON public.participant_chest_number_changes USING btree (participant_id, changed_at DESC);

CREATE UNIQUE INDEX registrations_general_entry_chest_unique ON public.registrations USING btree (festival_id, entry_chest_number) WHERE ((entry_kind = 'general_team'::text) AND (entry_chest_number IS NOT NULL));

CREATE INDEX scoring_publications_scope ON public.scoring_publications USING btree (tenant_id, festival_id, schedule_id);

-- Triggers
CREATE TRIGGER guard_final_chest_regeneration BEFORE INSERT ON public.chest_number_regeneration_audits FOR EACH ROW EXECUTE FUNCTION guard_final_chest_numbers();
ALTER TABLE "public"."chest_number_regeneration_audits" ENABLE TRIGGER "guard_final_chest_regeneration";

CREATE TRIGGER guard_final_chest_calendar BEFORE UPDATE OF chest_number_template, chest_number_category_range ON public.festival_calendar FOR EACH ROW EXECUTE FUNCTION guard_final_chest_numbers();
ALTER TABLE "public"."festival_calendar" ENABLE TRIGGER "guard_final_chest_calendar";

CREATE TRIGGER sync_festival_chest_numbers_on_settings_change AFTER INSERT OR UPDATE OF chest_number_template, chest_number_category_range ON public.festival_calendar FOR EACH ROW EXECUTE FUNCTION sync_festival_chest_numbers_on_settings_change();
ALTER TABLE "public"."festival_calendar" ENABLE TRIGGER "sync_festival_chest_numbers_on_settings_change";

CREATE TRIGGER guard_final_chest_slots BEFORE INSERT OR DELETE OR UPDATE ON public.festival_team_chest_slots FOR EACH ROW EXECUTE FUNCTION guard_final_chest_numbers();
ALTER TABLE "public"."festival_team_chest_slots" ENABLE TRIGGER "guard_final_chest_slots";

CREATE TRIGGER general_group_members_guard BEFORE INSERT OR DELETE OR UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_member();
ALTER TABLE "public"."group_members" ENABLE TRIGGER "general_group_members_guard";

CREATE CONSTRAINT TRIGGER group_leader_roster_membership AFTER INSERT OR DELETE OR UPDATE ON public.group_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION group_entry_private.ensure_leader_membership();
ALTER TABLE "public"."group_members" ENABLE TRIGGER "group_leader_roster_membership";

CREATE TRIGGER item_scoring_contract_insert BEFORE INSERT ON public.items FOR EACH ROW EXECUTE FUNCTION scoring_private.check_item_scoring_contract();
ALTER TABLE "public"."items" ENABLE TRIGGER "item_scoring_contract_insert";

CREATE TRIGGER item_scoring_contract_update BEFORE UPDATE OF source, participation_type, group_min_members, group_max_members ON public.items FOR EACH ROW EXECUTE FUNCTION scoring_private.check_item_scoring_contract();
ALTER TABLE "public"."items" ENABLE TRIGGER "item_scoring_contract_update";

CREATE TRIGGER scoring_single_category BEFORE INSERT OR UPDATE OF category_codes ON public.items FOR EACH ROW EXECUTE FUNCTION scoring_private.single_competition_category();
ALTER TABLE "public"."items" ENABLE TRIGGER "scoring_single_category";

CREATE TRIGGER audit_participant_chest_number_change AFTER UPDATE OF chest_number, organisation_id ON public.participants FOR EACH ROW EXECUTE FUNCTION audit_participant_chest_number_change();
ALTER TABLE "public"."participants" ENABLE TRIGGER "audit_participant_chest_number_change";

CREATE TRIGGER group_entry_participant_chest_guard BEFORE INSERT OR UPDATE OF chest_number, festival_id ON public.participants FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_participant_chest();
ALTER TABLE "public"."participants" ENABLE TRIGGER "group_entry_participant_chest_guard";

CREATE TRIGGER group_leader_team_move_guard BEFORE UPDATE OF festival_id, organisation_id ON public.participants FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_leader_team_move();
ALTER TABLE "public"."participants" ENABLE TRIGGER "group_leader_team_move_guard";

CREATE TRIGGER guard_final_chest_participant BEFORE UPDATE OF chest_number, organisation_id, festival_id ON public.participants FOR EACH ROW EXECUTE FUNCTION guard_final_chest_numbers();
ALTER TABLE "public"."participants" ENABLE TRIGGER "guard_final_chest_participant";

CREATE TRIGGER renumber_participant_on_team_change BEFORE UPDATE OF organisation_id ON public.participants FOR EACH ROW WHEN ((old.organisation_id IS DISTINCT FROM new.organisation_id)) EXECUTE FUNCTION renumber_participant_on_team_change();
ALTER TABLE "public"."participants" ENABLE TRIGGER "renumber_participant_on_team_change";

CREATE TRIGGER trg_enforce_festival_participant_gender BEFORE INSERT OR UPDATE OF gender, festival_id ON public.participants FOR EACH ROW EXECUTE FUNCTION enforce_festival_participant_gender();
ALTER TABLE "public"."participants" ENABLE TRIGGER "trg_enforce_festival_participant_gender";

CREATE TRIGGER validate_team_chest_number_on_insert BEFORE INSERT ON public.participants FOR EACH ROW EXECUTE FUNCTION validate_team_chest_number_on_insert();
ALTER TABLE "public"."participants" ENABLE TRIGGER "validate_team_chest_number_on_insert";

CREATE TRIGGER points_config_normalize_default_grade_points BEFORE INSERT OR UPDATE ON public.points_config FOR EACH ROW EXECUTE FUNCTION scoring_private.normalize_default_grade_points();
ALTER TABLE "public"."points_config" ENABLE TRIGGER "points_config_normalize_default_grade_points";

CREATE TRIGGER scoring_config_write BEFORE INSERT OR UPDATE ON public.points_config FOR EACH ROW EXECUTE FUNCTION scoring_private.check_config_write();
ALTER TABLE "public"."points_config" ENABLE TRIGGER "scoring_config_write";

CREATE TRIGGER group_entry_identity_guard BEFORE INSERT OR UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_identity();
ALTER TABLE "public"."registrations" ENABLE TRIGGER "group_entry_identity_guard";

CREATE CONSTRAINT TRIGGER group_leader_registration_membership AFTER INSERT OR UPDATE ON public.registrations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION group_entry_private.ensure_leader_membership();
ALTER TABLE "public"."registrations" ENABLE TRIGGER "group_leader_registration_membership";

CREATE TRIGGER registrations_clear_fixed_letter BEFORE UPDATE OF code_letter ON public.registrations FOR EACH ROW EXECUTE FUNCTION code_letter_private.clear_fixed_on_clear();
ALTER TABLE "public"."registrations" ENABLE TRIGGER "registrations_clear_fixed_letter";

CREATE TRIGGER registrations_notify_code_letters AFTER UPDATE ON public.registrations REFERENCING OLD TABLE AS code_letter_old NEW TABLE AS code_letter_new FOR EACH STATEMENT EXECUTE FUNCTION code_letter_private.notify_change();
ALTER TABLE "public"."registrations" ENABLE TRIGGER "registrations_notify_code_letters";

CREATE TRIGGER registrations_reopen_program_intake AFTER INSERT OR DELETE ON public.registrations FOR EACH ROW EXECUTE FUNCTION reopen_program_intake_on_registration_change();
ALTER TABLE "public"."registrations" ENABLE TRIGGER "registrations_reopen_program_intake";

CREATE TRIGGER trg_ensure_stage_venue_pin AFTER INSERT OR UPDATE OF tenant_id, festival_id ON public.venues FOR EACH ROW EXECUTE FUNCTION stage_portal_private.ensure_venue_pin();
ALTER TABLE "public"."venues" ENABLE TRIGGER "trg_ensure_stage_venue_pin";

-- Row access policies
CREATE POLICY "grace_submission_read" ON "public"."grace_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_superadmin() OR (tenant_id = get_my_tenant_id())));

CREATE POLICY "grace_workspace_read" ON "public"."grace_workspaces" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_superadmin() OR (tenant_id = get_my_tenant_id())));

CREATE POLICY "group_members_visible_registration_read" ON "public"."group_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_superadmin() OR (EXISTS ( SELECT 1
   FROM registrations r
  WHERE ((r.id = group_members.registration_id) AND is_org_visible(r.organisation_id))))));

CREATE POLICY "participant_chest_number_changes_read" ON "public"."participant_chest_number_changes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((tenant_id = get_my_tenant_id()) OR is_superadmin()));

CREATE POLICY "program_intake_status_admin_read" ON "public"."program_intake_statuses" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles actor
  WHERE ((actor.id = ( SELECT auth.uid() AS uid)) AND ((actor.is_superadmin IS TRUE) OR ((actor.role = 'admin'::text) AND (actor.tenant_id = program_intake_statuses.tenant_id)))))));

CREATE POLICY "scoring_publications_read" ON "public"."scoring_publications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((is_superadmin() OR (tenant_id = get_my_tenant_id())));

-- Row level security flags
ALTER TABLE "group_entry_private"."member_edit_authorizations" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "group_entry_private"."member_edit_authorizations" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."festival_chest_number_controls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."festival_chest_number_controls" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."festival_team_chest_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."festival_team_chest_slots" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."general_entry_number_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."general_entry_number_counters" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."grace_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."grace_submissions" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."grace_workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."grace_workspaces" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."participant_chest_number_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."participant_chest_number_changes" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."program_intake_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."program_intake_statuses" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."scoring_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scoring_publications" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "stage_portal_private"."pin_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stage_portal_private"."pin_attempts" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "stage_portal_private"."venue_access_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stage_portal_private"."venue_access_codes" NO FORCE ROW LEVEL SECURITY;

-- Schema grants
REVOKE ALL PRIVILEGES ON SCHEMA "code_letter_private" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA "code_letter_private" FROM "postgres";

GRANT CREATE ON SCHEMA "code_letter_private" TO "postgres";

GRANT USAGE ON SCHEMA "code_letter_private" TO "postgres";

REVOKE ALL PRIVILEGES ON SCHEMA "group_entry_private" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA "group_entry_private" FROM "postgres";

GRANT CREATE ON SCHEMA "group_entry_private" TO "postgres";

GRANT USAGE ON SCHEMA "group_entry_private" TO "postgres";

REVOKE ALL PRIVILEGES ON SCHEMA "scoring_private" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA "scoring_private" FROM "postgres";

GRANT CREATE ON SCHEMA "scoring_private" TO "postgres";

GRANT USAGE ON SCHEMA "scoring_private" TO "postgres";

REVOKE ALL PRIVILEGES ON SCHEMA "stage_portal_private" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA "stage_portal_private" FROM "postgres";

GRANT CREATE ON SCHEMA "stage_portal_private" TO "postgres";

GRANT USAGE ON SCHEMA "stage_portal_private" TO "postgres";

-- Table grants
REVOKE ALL PRIVILEGES ON TABLE "group_entry_private"."member_edit_authorizations" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "group_entry_private"."member_edit_authorizations" FROM "postgres";

GRANT DELETE ON TABLE "group_entry_private"."member_edit_authorizations" TO "postgres";

GRANT INSERT ON TABLE "group_entry_private"."member_edit_authorizations" TO "postgres";

GRANT MAINTAIN ON TABLE "group_entry_private"."member_edit_authorizations" TO "postgres";

GRANT REFERENCES ON TABLE "group_entry_private"."member_edit_authorizations" TO "postgres";

GRANT SELECT ON TABLE "group_entry_private"."member_edit_authorizations" TO "postgres";

GRANT TRIGGER ON TABLE "group_entry_private"."member_edit_authorizations" TO "postgres";

GRANT TRUNCATE ON TABLE "group_entry_private"."member_edit_authorizations" TO "postgres";

GRANT UPDATE ON TABLE "group_entry_private"."member_edit_authorizations" TO "postgres";

REVOKE ALL PRIVILEGES ON TABLE "public"."festival_chest_number_controls" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_chest_number_controls" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_chest_number_controls" FROM "service_role";

GRANT DELETE ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT INSERT ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT REFERENCES ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT SELECT ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT TRIGGER ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT UPDATE ON TABLE "public"."festival_chest_number_controls" TO "postgres";

GRANT DELETE ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT INSERT ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT REFERENCES ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT SELECT ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT TRIGGER ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."festival_chest_number_controls" TO "service_role";

GRANT UPDATE ON TABLE "public"."festival_chest_number_controls" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."festival_team_chest_slots" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_team_chest_slots" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."festival_team_chest_slots" FROM "service_role";

GRANT DELETE ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT INSERT ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT REFERENCES ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT SELECT ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT TRIGGER ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT UPDATE ON TABLE "public"."festival_team_chest_slots" TO "postgres";

GRANT DELETE ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT INSERT ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT REFERENCES ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT SELECT ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT TRIGGER ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."festival_team_chest_slots" TO "service_role";

GRANT UPDATE ON TABLE "public"."festival_team_chest_slots" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."general_entry_number_counters" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."general_entry_number_counters" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."general_entry_number_counters" FROM "service_role";

GRANT DELETE ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT INSERT ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT REFERENCES ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT SELECT ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT TRIGGER ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT UPDATE ON TABLE "public"."general_entry_number_counters" TO "postgres";

GRANT DELETE ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT INSERT ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT REFERENCES ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT SELECT ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT TRIGGER ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."general_entry_number_counters" TO "service_role";

GRANT UPDATE ON TABLE "public"."general_entry_number_counters" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."grace_marks" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_marks" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_marks" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_marks" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_marks" FROM "anon";

GRANT SELECT ON TABLE "public"."grace_marks" TO "authenticated";

GRANT DELETE ON TABLE "public"."grace_marks" TO "postgres";

GRANT INSERT ON TABLE "public"."grace_marks" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."grace_marks" TO "postgres";

GRANT REFERENCES ON TABLE "public"."grace_marks" TO "postgres";

GRANT SELECT ON TABLE "public"."grace_marks" TO "postgres";

GRANT TRIGGER ON TABLE "public"."grace_marks" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."grace_marks" TO "postgres";

GRANT UPDATE ON TABLE "public"."grace_marks" TO "postgres";

GRANT DELETE ON TABLE "public"."grace_marks" TO "service_role";

GRANT INSERT ON TABLE "public"."grace_marks" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."grace_marks" TO "service_role";

GRANT REFERENCES ON TABLE "public"."grace_marks" TO "service_role";

GRANT SELECT ON TABLE "public"."grace_marks" TO "service_role";

GRANT TRIGGER ON TABLE "public"."grace_marks" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."grace_marks" TO "service_role";

GRANT UPDATE ON TABLE "public"."grace_marks" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."grace_submissions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_submissions" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_submissions" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_submissions" FROM "service_role";

GRANT SELECT ON TABLE "public"."grace_submissions" TO "authenticated";

GRANT DELETE ON TABLE "public"."grace_submissions" TO "postgres";

GRANT INSERT ON TABLE "public"."grace_submissions" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."grace_submissions" TO "postgres";

GRANT REFERENCES ON TABLE "public"."grace_submissions" TO "postgres";

GRANT SELECT ON TABLE "public"."grace_submissions" TO "postgres";

GRANT TRIGGER ON TABLE "public"."grace_submissions" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."grace_submissions" TO "postgres";

GRANT UPDATE ON TABLE "public"."grace_submissions" TO "postgres";

GRANT DELETE ON TABLE "public"."grace_submissions" TO "service_role";

GRANT INSERT ON TABLE "public"."grace_submissions" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."grace_submissions" TO "service_role";

GRANT REFERENCES ON TABLE "public"."grace_submissions" TO "service_role";

GRANT SELECT ON TABLE "public"."grace_submissions" TO "service_role";

GRANT TRIGGER ON TABLE "public"."grace_submissions" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."grace_submissions" TO "service_role";

GRANT UPDATE ON TABLE "public"."grace_submissions" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."grace_workspaces" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_workspaces" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_workspaces" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."grace_workspaces" FROM "service_role";

GRANT SELECT ON TABLE "public"."grace_workspaces" TO "authenticated";

GRANT DELETE ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT INSERT ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT REFERENCES ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT SELECT ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT TRIGGER ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT UPDATE ON TABLE "public"."grace_workspaces" TO "postgres";

GRANT DELETE ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT INSERT ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT REFERENCES ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT SELECT ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT TRIGGER ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."grace_workspaces" TO "service_role";

GRANT UPDATE ON TABLE "public"."grace_workspaces" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."participant_chest_number_changes" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."participant_chest_number_changes" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."participant_chest_number_changes" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."participant_chest_number_changes" FROM "service_role";

GRANT SELECT ON TABLE "public"."participant_chest_number_changes" TO "authenticated";

GRANT DELETE ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT INSERT ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT REFERENCES ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT SELECT ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT TRIGGER ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT UPDATE ON TABLE "public"."participant_chest_number_changes" TO "postgres";

GRANT DELETE ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT INSERT ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT REFERENCES ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT SELECT ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT TRIGGER ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."participant_chest_number_changes" TO "service_role";

GRANT UPDATE ON TABLE "public"."participant_chest_number_changes" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."points_config_versions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."points_config_versions" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."points_config_versions" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."points_config_versions" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."points_config_versions" FROM "anon";

GRANT SELECT ON TABLE "public"."points_config_versions" TO "authenticated";

GRANT DELETE ON TABLE "public"."points_config_versions" TO "postgres";

GRANT INSERT ON TABLE "public"."points_config_versions" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."points_config_versions" TO "postgres";

GRANT REFERENCES ON TABLE "public"."points_config_versions" TO "postgres";

GRANT SELECT ON TABLE "public"."points_config_versions" TO "postgres";

GRANT TRIGGER ON TABLE "public"."points_config_versions" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."points_config_versions" TO "postgres";

GRANT UPDATE ON TABLE "public"."points_config_versions" TO "postgres";

GRANT DELETE ON TABLE "public"."points_config_versions" TO "service_role";

GRANT INSERT ON TABLE "public"."points_config_versions" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."points_config_versions" TO "service_role";

GRANT REFERENCES ON TABLE "public"."points_config_versions" TO "service_role";

GRANT SELECT ON TABLE "public"."points_config_versions" TO "service_role";

GRANT TRIGGER ON TABLE "public"."points_config_versions" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."points_config_versions" TO "service_role";

GRANT UPDATE ON TABLE "public"."points_config_versions" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."program_intake_statuses" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."program_intake_statuses" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."program_intake_statuses" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."program_intake_statuses" FROM "service_role";

GRANT SELECT ON TABLE "public"."program_intake_statuses" TO "authenticated";

GRANT DELETE ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT INSERT ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT REFERENCES ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT SELECT ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT TRIGGER ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT UPDATE ON TABLE "public"."program_intake_statuses" TO "postgres";

GRANT DELETE ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT INSERT ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT REFERENCES ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT SELECT ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT TRIGGER ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."program_intake_statuses" TO "service_role";

GRANT UPDATE ON TABLE "public"."program_intake_statuses" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "public"."scoring_publications" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."scoring_publications" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."scoring_publications" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."scoring_publications" FROM "service_role";

GRANT SELECT ON TABLE "public"."scoring_publications" TO "authenticated";

GRANT DELETE ON TABLE "public"."scoring_publications" TO "postgres";

GRANT INSERT ON TABLE "public"."scoring_publications" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."scoring_publications" TO "postgres";

GRANT REFERENCES ON TABLE "public"."scoring_publications" TO "postgres";

GRANT SELECT ON TABLE "public"."scoring_publications" TO "postgres";

GRANT TRIGGER ON TABLE "public"."scoring_publications" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."scoring_publications" TO "postgres";

GRANT UPDATE ON TABLE "public"."scoring_publications" TO "postgres";

GRANT DELETE ON TABLE "public"."scoring_publications" TO "service_role";

GRANT INSERT ON TABLE "public"."scoring_publications" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."scoring_publications" TO "service_role";

GRANT REFERENCES ON TABLE "public"."scoring_publications" TO "service_role";

GRANT SELECT ON TABLE "public"."scoring_publications" TO "service_role";

GRANT TRIGGER ON TABLE "public"."scoring_publications" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."scoring_publications" TO "service_role";

GRANT UPDATE ON TABLE "public"."scoring_publications" TO "service_role";

REVOKE ALL PRIVILEGES ON TABLE "stage_portal_private"."pin_attempts" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "stage_portal_private"."pin_attempts" FROM "postgres";

GRANT DELETE ON TABLE "stage_portal_private"."pin_attempts" TO "postgres";

GRANT INSERT ON TABLE "stage_portal_private"."pin_attempts" TO "postgres";

GRANT MAINTAIN ON TABLE "stage_portal_private"."pin_attempts" TO "postgres";

GRANT REFERENCES ON TABLE "stage_portal_private"."pin_attempts" TO "postgres";

GRANT SELECT ON TABLE "stage_portal_private"."pin_attempts" TO "postgres";

GRANT TRIGGER ON TABLE "stage_portal_private"."pin_attempts" TO "postgres";

GRANT TRUNCATE ON TABLE "stage_portal_private"."pin_attempts" TO "postgres";

GRANT UPDATE ON TABLE "stage_portal_private"."pin_attempts" TO "postgres";

REVOKE ALL PRIVILEGES ON TABLE "stage_portal_private"."venue_access_codes" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "stage_portal_private"."venue_access_codes" FROM "postgres";

GRANT DELETE ON TABLE "stage_portal_private"."venue_access_codes" TO "postgres";

GRANT INSERT ON TABLE "stage_portal_private"."venue_access_codes" TO "postgres";

GRANT MAINTAIN ON TABLE "stage_portal_private"."venue_access_codes" TO "postgres";

GRANT REFERENCES ON TABLE "stage_portal_private"."venue_access_codes" TO "postgres";

GRANT SELECT ON TABLE "stage_portal_private"."venue_access_codes" TO "postgres";

GRANT TRIGGER ON TABLE "stage_portal_private"."venue_access_codes" TO "postgres";

GRANT TRUNCATE ON TABLE "stage_portal_private"."venue_access_codes" TO "postgres";

GRANT UPDATE ON TABLE "stage_portal_private"."venue_access_codes" TO "postgres";

-- Function grants
REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."clear_fixed_on_clear"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."clear_fixed_on_clear"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "code_letter_private"."clear_fixed_on_clear"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."entries"(s schedules, portal boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."entries"(s schedules, portal boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "code_letter_private"."entries"(s schedules, portal boolean) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."lock_schedule"(tenant uuid, schedule uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."lock_schedule"(tenant uuid, schedule uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "code_letter_private"."lock_schedule"(tenant uuid, schedule uuid) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."people"(registration uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."people"(registration uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "code_letter_private"."people"(registration uuid) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."conflicts"(s schedules, registration uuid, portal boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."conflicts"(s schedules, registration uuid, portal boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "code_letter_private"."conflicts"(s schedules, registration uuid, portal boolean) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."edit"(tenant uuid, schedule uuid, registration uuid, letter text, expected_letter text, expected_swap uuid, portal boolean, venue uuid, festival uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."edit"(tenant uuid, schedule uuid, registration uuid, letter text, expected_letter text, expected_swap uuid, portal boolean, venue uuid, festival uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "code_letter_private"."edit"(tenant uuid, schedule uuid, registration uuid, letter text, expected_letter text, expected_swap uuid, portal boolean, venue uuid, festival uuid) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."match_entry"(entry text, choices jsonb, matching jsonb, seen text[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."match_entry"(entry text, choices jsonb, matching jsonb, seen text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "code_letter_private"."match_entry"(entry text, choices jsonb, matching jsonb, seen text[]) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."draw"(tenant uuid, schedule uuid, overwrite boolean, portal boolean, venue uuid, festival uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."draw"(tenant uuid, schedule uuid, overwrite boolean, portal boolean, venue uuid, festival uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "code_letter_private"."draw"(tenant uuid, schedule uuid, overwrite boolean, portal boolean, venue uuid, festival uuid) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."notify_change"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "code_letter_private"."notify_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "code_letter_private"."notify_change"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."allocate_chest"(p_festival uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."allocate_chest"(p_festival uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."allocate_chest"(p_festival uuid) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."guard_participant_chest"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."guard_participant_chest"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."guard_participant_chest"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."guard_identity"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."guard_identity"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."guard_identity"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."guard_member"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."guard_member"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."guard_member"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."chest_number"(p_entry registrations) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."chest_number"(p_entry registrations) FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."chest_number"(p_entry registrations) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."category_code"(p_entry registrations) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."category_code"(p_entry registrations) FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."category_code"(p_entry registrations) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."display_name"(p_entry registrations) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."display_name"(p_entry registrations) FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."display_name"(p_entry registrations) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."guard_leader_team_move"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."guard_leader_team_move"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."guard_leader_team_move"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."ensure_leader_membership"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."ensure_leader_membership"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."ensure_leader_membership"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."validate_roster"(p_festival uuid, p_item uuid, p_org uuid, p_members uuid[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."validate_roster"(p_festival uuid, p_item uuid, p_org uuid, p_members uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."validate_roster"(p_festival uuid, p_item uuid, p_org uuid, p_members uuid[]) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."create_entry"(p_festival uuid, p_item uuid, p_org uuid, p_members uuid[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "group_entry_private"."create_entry"(p_festival uuid, p_item uuid, p_org uuid, p_members uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "group_entry_private"."create_entry"(p_festival uuid, p_item uuid, p_org uuid, p_members uuid[]) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_public_candidate_profile"(p_slug text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_public_candidate_profile"(p_slug text) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_public_candidate_profile"(p_slug text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_public_candidate_profile"(p_slug text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_public_candidate_profile"(p_slug text) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_public_candidate_profile"(p_slug text) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."get_public_candidate_profile"(p_slug text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_candidate_profile"(p_slug text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_candidate_profile"(p_slug text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_junior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_senior_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_upper_primary_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id uuid, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_lp_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_hs_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_hss_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_legacy_execute_general_import_chunk"(p_tenant_id uuid, p_festival_id uuid, p_session_id text, p_participants jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_next_festival_category_chest_number"(p_festival_id uuid, p_category_code text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."transfer_participant_team"(p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."transfer_participant_team"(p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."transfer_participant_team"(p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."transfer_participant_team"(p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."transfer_participant_team"(p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."transfer_participant_team"(p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."transfer_participant_team"(p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."transfer_participant_team"(p_participant_id uuid, p_new_org_id uuid, p_admin_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."calculate_festival_points"(p_festival_id uuid, p_grade text, p_rank integer, p_group_size integer, p_competing_teams_count integer, p_is_group boolean, p_bracket_override text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."calculate_festival_points"(p_festival_id uuid, p_grade text, p_rank integer, p_group_size integer, p_competing_teams_count integer, p_is_group boolean, p_bracket_override text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."calculate_festival_points"(p_festival_id uuid, p_grade text, p_rank integer, p_group_size integer, p_competing_teams_count integer, p_is_group boolean, p_bracket_override text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."calculate_festival_points"(p_festival_id uuid, p_grade text, p_rank integer, p_group_size integer, p_competing_teams_count integer, p_is_group boolean, p_bracket_override text) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."calculate_festival_points"(p_festival_id uuid, p_grade text, p_rank integer, p_group_size integer, p_competing_teams_count integer, p_is_group boolean, p_bracket_override text) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."calculate_festival_points"(p_festival_id uuid, p_grade text, p_rank integer, p_group_size integer, p_competing_teams_count integer, p_is_group boolean, p_bracket_override text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."calculate_festival_points"(p_festival_id uuid, p_grade text, p_rank integer, p_group_size integer, p_competing_teams_count integer, p_is_group boolean, p_bracket_override text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."calculate_festival_points"(p_festival_id uuid, p_grade text, p_rank integer, p_group_size integer, p_competing_teams_count integer, p_is_group boolean, p_bracket_override text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."admin_upsert_mark"(p_schedule_id uuid, p_judge_id uuid, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_max_mark numeric, p_criteria_snapshot jsonb, p_status text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."admin_upsert_mark"(p_schedule_id uuid, p_judge_id uuid, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_max_mark numeric, p_criteria_snapshot jsonb, p_status text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."admin_upsert_mark"(p_schedule_id uuid, p_judge_id uuid, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_max_mark numeric, p_criteria_snapshot jsonb, p_status text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."admin_upsert_mark"(p_schedule_id uuid, p_judge_id uuid, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_max_mark numeric, p_criteria_snapshot jsonb, p_status text) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."admin_upsert_mark"(p_schedule_id uuid, p_judge_id uuid, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_max_mark numeric, p_criteria_snapshot jsonb, p_status text) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."admin_upsert_mark"(p_schedule_id uuid, p_judge_id uuid, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_max_mark numeric, p_criteria_snapshot jsonb, p_status text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."admin_upsert_mark"(p_schedule_id uuid, p_judge_id uuid, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_max_mark numeric, p_criteria_snapshot jsonb, p_status text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_upsert_mark"(p_schedule_id uuid, p_judge_id uuid, p_registration_id uuid, p_criteria_scores jsonb, p_total_mark numeric, p_max_mark numeric, p_criteria_snapshot jsonb, p_status text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."unlock_schedule_marks"(p_schedule_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."unlock_schedule_marks"(p_schedule_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."unlock_schedule_marks"(p_schedule_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."unlock_schedule_marks"(p_schedule_id uuid) FROM "service_role";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."unlock_schedule_marks"(p_schedule_id uuid) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."unlock_schedule_marks"(p_schedule_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."unlock_schedule_marks"(p_schedule_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."unlock_schedule_marks"(p_schedule_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_competition_points"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_group_size integer) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_competition_results"(p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_request_id uuid, p_bracket text, p_group_size integer) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_scoring_configuration"(p_festival_id uuid, p_expected_version integer, p_config jsonb, p_reason text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_grace_workspace"(p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_grace_draft"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer, p_entries jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_all_grace_marks"(p_festival_id uuid, p_expected_version integer, p_expected_revision integer) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_judge_scoring_context"(p_token text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_judge_scoring_context"(p_token text) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_judge_scoring_context"(p_token text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_judge_scoring_context"(p_token text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_judge_scoring_context"(p_token text) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_judge_scoring_context"(p_token text) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."get_judge_scoring_context"(p_token text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_judge_scoring_context"(p_token text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_judge_scoring_context"(p_token text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_competition_items"(p_festival_id uuid, p_codes text[], p_records jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_general_team_entry"(p_festival_id uuid, p_item_id uuid, p_participant_ids uuid[]) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_participant_general_results"(p_participant_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."enforce_festival_participant_gender"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."enforce_festival_participant_gender"() FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."enforce_festival_participant_gender"() FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."enforce_festival_participant_gender"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_festival_participant_gender"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_participant_with_chest_number"(p_tenant_id uuid, p_festival_id uuid, p_organisation_id uuid, p_name text, p_category_code text, p_status text, p_age integer, p_class_std text, p_dob date, p_gender text, p_public_profile_enabled boolean, p_show_organisation_public boolean) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_program_intake_status"(p_festival_id uuid, p_item_id uuid, p_category_code text, p_entry_kind text, p_is_complete boolean) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."reopen_program_intake_on_registration_change"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."reopen_program_intake_on_registration_change"() FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."reopen_program_intake_on_registration_change"() FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."reopen_program_intake_on_registration_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."reopen_program_intake_on_registration_change"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_competition_item_changes"(p_festival_id uuid, p_activate_codes text[], p_deactivate_codes text[], p_records jsonb) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_archived_organisation"(p_org_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."ensure_festival_team_chest_slots"(p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."festival_team_chest_slot"(p_festival_id uuid, p_organisation_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."validate_team_chest_number_on_insert"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."validate_team_chest_number_on_insert"() FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."validate_team_chest_number_on_insert"() FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."validate_team_chest_number_on_insert"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_team_chest_number_on_insert"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_festival_chest_numbers_on_settings_change"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."renumber_participant_on_team_change"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."renumber_participant_on_team_change"() FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."renumber_participant_on_team_change"() FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."renumber_participant_on_team_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."renumber_participant_on_team_change"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."audit_participant_chest_number_change"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."audit_participant_chest_number_change"() FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."audit_participant_chest_number_change"() FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."audit_participant_chest_number_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."audit_participant_chest_number_change"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."assert_legacy_chest_import_allowed"(p_tenant_id uuid, p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_venue_codes"(p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_data"(p_venue_id uuid, p_pin text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_data"(p_venue_id uuid, p_pin text) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_data"(p_venue_id uuid, p_pin text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_data"(p_venue_id uuid, p_pin text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_data"(p_venue_id uuid, p_pin text) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_data"(p_venue_id uuid, p_pin text) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_data"(p_venue_id uuid, p_pin text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_data"(p_venue_id uuid, p_pin text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_data"(p_venue_id uuid, p_pin text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_update_registration"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_update_registration"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_update_registration"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_update_registration"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_update_registration"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_update_registration"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_update_registration"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_update_registration"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_update_registration"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_update_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_update_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_update_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_update_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_update_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_update_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_update_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_update_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_update_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_draw_letters"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_draw_letters"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_draw_letters"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_draw_letters"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_draw_letters"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_draw_letters"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_draw_letters"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_draw_letters"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_draw_letters"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_lock_schedule"(p_venue_id uuid, p_pin text, p_schedule_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_lock_schedule"(p_venue_id uuid, p_pin text, p_schedule_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_lock_schedule"(p_venue_id uuid, p_pin text, p_schedule_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_lock_schedule"(p_venue_id uuid, p_pin text, p_schedule_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_lock_schedule"(p_venue_id uuid, p_pin text, p_schedule_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_lock_schedule"(p_venue_id uuid, p_pin text, p_schedule_id uuid) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_lock_schedule"(p_venue_id uuid, p_pin text, p_schedule_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_lock_schedule"(p_venue_id uuid, p_pin text, p_schedule_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_lock_schedule"(p_venue_id uuid, p_pin text, p_schedule_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_edit_code_letter"(p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_draw_code_letters"(p_schedule_id uuid, p_overwrite boolean) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_edit_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_edit_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_edit_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_edit_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_edit_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_edit_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_edit_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_edit_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_edit_code_letter"(p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_stage_management_registrations_with_letters"(p_schedule_id uuid, p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_data_with_letters"(p_venue_id uuid, p_pin text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_data_with_letters"(p_venue_id uuid, p_pin text) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_data_with_letters"(p_venue_id uuid, p_pin text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_data_with_letters"(p_venue_id uuid, p_pin text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."stage_venue_portal_data_with_letters"(p_venue_id uuid, p_pin text) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_data_with_letters"(p_venue_id uuid, p_pin text) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_data_with_letters"(p_venue_id uuid, p_pin text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_data_with_letters"(p_venue_id uuid, p_pin text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stage_venue_portal_data_with_letters"(p_venue_id uuid, p_pin text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_team_leader_programs"(p_participant_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."team_leader_create_general_entry"(p_item_id uuid, p_participant_ids uuid[]) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."team_leader_assign_program"(p_participant_id uuid, p_item_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_team_leader_login_email"(p_username text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_competition_item"(p_festival_id uuid, p_item_id uuid, p_item_name_ml text, p_category_codes text[], p_group_member_count integer, p_expected_updated_at timestamp with time zone) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."assert_festival_chest_admin"(p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_final_chest_numbers"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_final_chest_numbers"() FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_final_chest_numbers"() FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."guard_final_chest_numbers"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."guard_final_chest_numbers"() TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_festival_chest_order"(p_festival_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_festival_chest_order"(p_festival_id uuid, p_team_ids uuid[], p_expected_team_ids uuid[], p_expected_revision integer, p_expected_range integer) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_festival_chest_lock"(p_festival_id uuid, p_locked boolean, p_expected_revision integer, p_expected_team_ids uuid[], p_expected_range integer, p_unlock_code text) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_general_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[]) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) FROM "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) FROM "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_group_team_roster"(p_registration_id uuid, p_participant_ids uuid[], p_expected_participant_ids uuid[], p_leader_participant_id uuid, p_expected_leader_participant_id uuid) TO "service_role";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."award"(c jsonb, item uuid, grade text, place integer, size integer, teams integer, is_group boolean, bracket_key text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."award"(c jsonb, item uuid, grade text, place integer, size integer, teams integer, is_group boolean, bracket_key text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."award"(c jsonb, item uuid, grade text, place integer, size integer, teams integer, is_group boolean, bracket_key text) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."eligible"(s schedules) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."eligible"(s schedules) FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."eligible"(s schedules) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."prepare_results"(p_schedule uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_size integer) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."prepare_results"(p_schedule uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_size integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."prepare_results"(p_schedule uuid, p_expected_version integer, p_entries jsonb, p_mode text, p_bracket text, p_size integer) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."assert_admin"(p_tenant uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."assert_admin"(p_tenant uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."assert_admin"(p_tenant uuid) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."whole"(v jsonb, positive boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."whole"(v jsonb, positive boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."whole"(v jsonb, positive boolean) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."validate_config"(p jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."validate_config"(p jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."validate_config"(p jsonb) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."check_config_write"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."check_config_write"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."check_config_write"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."grace_teams"(p_tenant uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."grace_teams"(p_tenant uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."grace_teams"(p_tenant uuid) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."validate_grace"(c points_config, teams jsonb, entries jsonb, complete boolean) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."validate_grace"(c points_config, teams jsonb, entries jsonb, complete boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."validate_grace"(c points_config, teams jsonb, entries jsonb, complete boolean) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."single_competition_category"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."single_competition_category"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."single_competition_category"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."check_item_scoring_contract"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."check_item_scoring_contract"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."check_item_scoring_contract"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "scoring_private"."check_item_scoring_contract"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."default_grade_point_map"(p_map jsonb, p_key text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."default_grade_point_map"(p_map jsonb, p_key text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."default_grade_point_map"(p_map jsonb, p_key text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "scoring_private"."default_grade_point_map"(p_map jsonb, p_key text) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."normalize_default_grade_points"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."normalize_default_grade_points"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."normalize_default_grade_points"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION "scoring_private"."normalize_default_grade_points"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."validate_boost_sections"(p jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "scoring_private"."validate_boost_sections"(p jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "scoring_private"."validate_boost_sections"(p jsonb) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "stage_portal_private"."generate_venue_pin"(p_venue_id uuid, p_tenant_id uuid, p_festival_id uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "stage_portal_private"."generate_venue_pin"(p_venue_id uuid, p_tenant_id uuid, p_festival_id uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "stage_portal_private"."generate_venue_pin"(p_venue_id uuid, p_tenant_id uuid, p_festival_id uuid) TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "stage_portal_private"."ensure_venue_pin"() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "stage_portal_private"."ensure_venue_pin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "stage_portal_private"."ensure_venue_pin"() TO "postgres";

REVOKE ALL PRIVILEGES ON FUNCTION "stage_portal_private"."assert_pin"(p_venue_id uuid, p_pin text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION "stage_portal_private"."assert_pin"(p_venue_id uuid, p_pin text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "stage_portal_private"."assert_pin"(p_venue_id uuid, p_pin text) TO "postgres";

-- Realtime publication membership
ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."festival_calendar";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."festival_leaderboard_settings";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."mark_entries";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."notification_logs";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."results";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."schedule_judge_assignments";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."schedules";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tenant_agent_prompts";

NOTIFY pgrst, 'reload schema';
COMMIT;
