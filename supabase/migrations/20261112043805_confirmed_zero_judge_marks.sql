BEGIN;

-- Do not overwrite a concurrent change to the existing judge save function.
DO $guard$
DECLARE current_hash text;
BEGIN
  SELECT md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')) INTO current_hash
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.oid = to_regprocedure(
    'public.upsert_judge_mark(text,uuid,jsonb,numeric,text,text,numeric,jsonb)');
  IF current_hash IS NULL OR current_hash NOT IN (
    'bb96f009ac8a30f6dc9670aa59b90e9d', '8828bc7fe64035d5606f5e02e771b6e4'
  ) THEN
    RAISE EXCEPTION 'Judge save function changed; review before applying this migration.';
  END IF;
END
$guard$;

-- Complete the exact judge/registration pairs confirmed by an administrator,
-- then publish in the same transaction. Existing final marks are never changed.
CREATE OR REPLACE FUNCTION public.publish_results_with_confirmed_zero_marks(
  p_schedule_id uuid, p_expected_version integer, p_entries jsonb,
  p_request_id uuid, p_bracket text, p_group_size integer,
  p_missing jsonb, p_zero_maximum numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, scoring_private
AS $function$
DECLARE
  s public.schedules%ROWTYPE;
  pair jsonb;
  assignment record;
  existing public.mark_entries%ROWTYPE;
  scores jsonb;
  snapshot jsonb;
  total numeric;
  expected_count integer;
  actual_count integer;
BEGIN
  SELECT * INTO s FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Schedule was not found.'; END IF;
  PERFORM scoring_private.assert_admin(s.tenant_id);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Publication request identity is required.'; END IF;

  -- A retried successful request must use the existing publication's input hash.
  IF EXISTS (SELECT 1 FROM public.scoring_publications WHERE id = p_request_id) THEN
    RETURN public.publish_competition_results(p_schedule_id, p_expected_version, p_entries,
      'judges', p_request_id, p_bracket, p_group_size);
  END IF;
  IF jsonb_typeof(p_missing) IS DISTINCT FROM 'array' OR jsonb_array_length(p_missing) = 0
     OR p_zero_maximum IS NULL OR p_zero_maximum <= 0
     OR p_zero_maximum::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'A confirmed list of missing marks and a valid maximum are required.';
  END IF;

  -- The judge portal uses the same per-judge advisory lock for final submission.
  FOR assignment IN
    SELECT a.judge_id FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = s.id AND a.tenant_id = s.tenant_id AND a.status = 'active'
    ORDER BY a.judge_id FOR SHARE
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(s.id::text || ':' || assignment.judge_id::text || ':judge-final-submit', 0));
  END LOOP;
  IF (SELECT count(DISTINCT a.judge_id) FROM public.schedule_judge_assignments a
      WHERE a.schedule_id = s.id AND a.tenant_id = s.tenant_id AND a.status = 'active')
     IS DISTINCT FROM COALESCE(s.expected_judge_count, 3)::bigint THEN
    RAISE EXCEPTION 'The judge assignments changed. Refresh and review the marks.' USING ERRCODE = '40001';
  END IF;

  SELECT count(*) INTO actual_count
  FROM scoring_private.eligible(s) r
  CROSS JOIN public.schedule_judge_assignments a
  LEFT JOIN public.mark_entries m ON m.schedule_id = s.id AND m.tenant_id = s.tenant_id
    AND m.judge_id = a.judge_id AND m.registration_id = r.id
  WHERE a.schedule_id = s.id AND a.tenant_id = s.tenant_id AND a.status = 'active'
    AND m.is_final IS NOT TRUE;
  SELECT count(DISTINCT (x.value->>'registration_id', x.value->>'judge_id')) INTO expected_count
  FROM jsonb_array_elements(p_missing) x;
  IF expected_count <> jsonb_array_length(p_missing) OR actual_count <> expected_count THEN
    RAISE EXCEPTION 'The missing marks changed. Refresh and review the marks.' USING ERRCODE = '40001';
  END IF;

  FOR pair IN SELECT value FROM jsonb_array_elements(p_missing) LOOP
    IF NOT EXISTS (SELECT 1 FROM scoring_private.eligible(s) r WHERE r.id = (pair->>'registration_id')::uuid)
       OR NOT EXISTS (SELECT 1 FROM public.schedule_judge_assignments a WHERE a.schedule_id = s.id
         AND a.tenant_id = s.tenant_id AND a.status = 'active' AND a.judge_id = (pair->>'judge_id')::uuid) THEN
      RAISE EXCEPTION 'A confirmed entry is outside this schedule.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO existing FROM public.mark_entries m
    WHERE m.schedule_id = s.id AND m.tenant_id = s.tenant_id
      AND m.registration_id = (pair->>'registration_id')::uuid AND m.judge_id = (pair->>'judge_id')::uuid
    FOR UPDATE;
    IF existing.id IS DISTINCT FROM NULLIF(pair->>'mark_id', '')::uuid
       OR (existing.id IS NOT NULL AND (existing.is_final IS TRUE
         OR existing.updated_at IS DISTINCT FROM (pair->>'updated_at')::timestamptz
         OR jsonb_build_object('criteria_scores', existing.criteria_scores, 'total_mark', existing.total_mark,
           'entry_mode_snapshot', existing.entry_mode_snapshot, 'max_mark_snapshot', existing.max_mark_snapshot,
           'criteria_snapshot', existing.criteria_snapshot, 'is_draft', existing.is_draft) IS DISTINCT FROM pair->'snapshot')) THEN
      RAISE EXCEPTION 'A mark changed after confirmation. Refresh and review it.' USING ERRCODE = '40001';
    END IF;
    IF existing.id IS NULL THEN
      INSERT INTO public.mark_entries(tenant_id, schedule_id, judge_id, registration_id,
        criteria_scores, total_mark, is_draft, is_final, submitted_at,
        entry_mode_snapshot, max_mark_snapshot, criteria_snapshot)
      VALUES(s.tenant_id, s.id, (pair->>'judge_id')::uuid, (pair->>'registration_id')::uuid,
        '{}'::jsonb, 0, false, true, now(), 'total_only', p_zero_maximum, '[]'::jsonb);
    ELSE
      scores := COALESCE(existing.criteria_scores, '{}'::jsonb);
      snapshot := COALESCE(existing.criteria_snapshot, '[]'::jsonb);
      IF existing.entry_mode_snapshot = 'criteria' THEN
        SELECT scores || COALESCE(jsonb_object_agg(c.value->>'key', '0'::jsonb)
          FILTER (WHERE NOT scores ? (c.value->>'key')), '{}'::jsonb)
        INTO scores FROM jsonb_array_elements(snapshot) c;
        SELECT COALESCE(sum((v.value #>> '{}')::numeric), 0) INTO total FROM jsonb_each(scores) v;
      ELSE
        total := COALESCE(existing.total_mark, 0);
      END IF;
      UPDATE public.mark_entries SET criteria_scores = scores, total_mark = total,
        is_draft = false, is_final = true, submitted_at = now(), updated_at = now()
      WHERE id = existing.id;
    END IF;
  END LOOP;
  RETURN public.publish_competition_results(p_schedule_id, p_expected_version, p_entries,
    'judges', p_request_id, p_bracket, p_group_size);
END
$function$;
REVOKE ALL ON FUNCTION public.publish_results_with_confirmed_zero_marks(uuid, integer, jsonb, uuid, text, integer, jsonb, numeric) FROM PUBLIC, anon, authenticated;

-- Close only this schedule's unused codes in the same transaction as publish.
-- A failed publication rolls the revocations back. A retry of a completed
-- publication must not revoke codes issued after the original request.
CREATE OR REPLACE FUNCTION public.publish_results_closing_judge_codes(
  p_schedule_id uuid, p_expected_version integer, p_entries jsonb, p_mode text,
  p_request_id uuid, p_bracket text, p_group_size integer,
  p_missing jsonb, p_zero_maximum numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, scoring_private
AS $function$
DECLARE s public.schedules%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.schedules WHERE id = p_schedule_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Schedule was not found.'; END IF;
  PERFORM scoring_private.assert_admin(s.tenant_id);
  IF p_mode NOT IN ('judges', 'manual') OR p_mode IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid publication request.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.scoring_publications WHERE id = p_request_id) THEN
    RETURN public.publish_competition_results(p_schedule_id, p_expected_version, p_entries,
      p_mode, p_request_id, p_bracket, p_group_size);
  END IF;
  IF jsonb_typeof(p_missing) IS DISTINCT FROM 'array'
     OR (p_mode = 'manual' AND jsonb_array_length(p_missing) <> 0) THEN
    RAISE EXCEPTION 'Invalid confirmed missing-mark list.';
  END IF;

  UPDATE public.judge_tokens SET is_revoked = true, revoked_at = now(), revoked_by = auth.uid(),
    revocation_reason = 'Results published by administrator',
    status = CASE WHEN status IN ('created', 'pending_approval', 'approved') THEN 'rejected' ELSE status END
  WHERE schedule_id = s.id AND tenant_id = s.tenant_id
    AND is_used IS FALSE AND is_revoked IS NOT TRUE;

  IF p_mode = 'judges' AND jsonb_array_length(p_missing) > 0 THEN
    RETURN public.publish_results_with_confirmed_zero_marks(p_schedule_id, p_expected_version, p_entries,
      p_request_id, p_bracket, p_group_size, p_missing, p_zero_maximum);
  END IF;
  RETURN public.publish_competition_results(p_schedule_id, p_expected_version, p_entries,
    p_mode, p_request_id, p_bracket, p_group_size);
END
$function$;
REVOKE ALL ON FUNCTION public.publish_results_closing_judge_codes(uuid, integer, jsonb, text, uuid, text, integer, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_results_closing_judge_codes(uuid, integer, jsonb, text, uuid, text, integer, jsonb, numeric) TO authenticated;

-- Lock the validated token while saving, so publication revocation and
-- an in-flight judge save serialize on the same row. Existing grants remain.
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
  LIMIT 1
  FOR UPDATE;

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

COMMIT;
