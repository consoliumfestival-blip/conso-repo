CREATE OR REPLACE FUNCTION public.submit_judge_marks(
  p_token text,
  p_entries jsonb,
  p_entry_mode text,
  p_max_mark numeric,
  p_criteria_snapshot jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'extensions'
AS $function$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
  v_entry jsonb;
  v_registration_id uuid;
  v_scores jsonb;
  v_snapshot jsonb;
  v_total numeric;
  v_existing public.mark_entries%ROWTYPE;
  v_roster_ids uuid[];
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_finalized_count integer := 0;
  v_already_final_count integer := 0;
BEGIN
  IF p_token IS NULL OR pg_catalog.btrim(p_token) = '' THEN
    RAISE EXCEPTION 'Access code is required.' USING ERRCODE = '22023';
  END IF;
  IF p_entries IS NULL OR pg_catalog.jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Marks submission must be an array.' USING ERRCODE = '22023';
  END IF;
  IF p_entry_mode IS NULL OR p_entry_mode NOT IN ('criteria', 'total_only') THEN
    RAISE EXCEPTION 'Invalid marks entry mode.' USING ERRCODE = '22023';
  END IF;
  IF p_entry_mode = 'criteria'
    AND pg_catalog.jsonb_typeof(COALESCE(p_criteria_snapshot, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Criteria snapshot must be an array.' USING ERRCODE = '22023';
  END IF;

  SELECT jt.*
    INTO v_token
  FROM public.judge_tokens jt
  WHERE (
      jt.token_hash = pg_catalog.encode(
        extensions.digest(pg_catalog.upper(pg_catalog.btrim(p_token)), 'sha256'),
        'hex'
      )
      OR jt.token = pg_catalog.upper(pg_catalog.btrim(p_token))
    )
    AND jt.status = 'approved'
    AND jt.is_used IS FALSE
    AND jt.is_revoked IS NOT TRUE
    AND (jt.expires_at IS NULL OR jt.expires_at > pg_catalog.now())
  ORDER BY jt.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Access code is invalid, awaiting approval, or expired.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments assignment
    WHERE assignment.schedule_id = v_token.schedule_id
      AND assignment.judge_id = v_token.judge_id
      AND assignment.tenant_id = v_token.tenant_id
      AND assignment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This judge is no longer assigned to the event.' USING ERRCODE = '42501';
  END IF;

  -- The roster RPC applies the same token, festival, item, eligibility, and
  -- organisation-tree scope as the Judge portal. Require every current row.
  SELECT COALESCE(
      pg_catalog.array_agg(roster.id ORDER BY roster.code_letter, roster.id),
      ARRAY[]::uuid[]
    )
    INTO v_roster_ids
  FROM public.get_judge_registrations(p_token) roster;

  IF pg_catalog.jsonb_array_length(p_entries) <> pg_catalog.cardinality(v_roster_ids) THEN
    RAISE EXCEPTION 'The participant list changed. Refresh the Judge portal before submitting.' USING ERRCODE = '40001';
  END IF;
  IF pg_catalog.jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'There are no eligible participants to submit marks for.' USING ERRCODE = '22023';
  END IF;

  -- Serialize duplicate final submissions for this judge and event.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_token.schedule_id::text || ':' || v_token.judge_id::text || ':judge-final-submit',
    0
  ));

  FOR v_entry IN
    SELECT entry.value
    FROM pg_catalog.jsonb_array_elements(p_entries) AS entry(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Each marks entry must be an object.' USING ERRCODE = '22023';
    END IF;

    v_registration_id := NULLIF(pg_catalog.btrim(v_entry->>'registration_id'), '')::uuid;
    IF v_registration_id IS NULL THEN
      RAISE EXCEPTION 'A marks entry is missing its registration.' USING ERRCODE = '22023';
    END IF;
    IF v_registration_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'A registration appears more than once in this submission.' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_registration_id = ANY(v_roster_ids)) THEN
      RAISE EXCEPTION 'A registration is outside the current Judge roster.' USING ERRCODE = '42501';
    END IF;

    v_total := NULLIF(pg_catalog.btrim(v_entry->>'total_mark'), '')::numeric;
    IF p_entry_mode = 'total_only' THEN
      v_scores := '{}'::jsonb;
      v_snapshot := '[]'::jsonb;
    ELSE
      v_scores := COALESCE(v_entry->'criteria_scores', '{}'::jsonb);
      IF pg_catalog.jsonb_typeof(v_scores) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Criteria scores must be an object.' USING ERRCODE = '22023';
      END IF;
      v_snapshot := COALESCE(p_criteria_snapshot, '[]'::jsonb);
    END IF;

    SELECT mark.*
      INTO v_existing
    FROM public.mark_entries mark
    WHERE mark.tenant_id = v_token.tenant_id
      AND mark.schedule_id = v_token.schedule_id
      AND mark.judge_id = v_token.judge_id
      AND mark.registration_id = v_registration_id
    FOR UPDATE;

    IF v_existing.id IS NOT NULL AND v_existing.is_final IS TRUE THEN
      -- Allow recovery from an earlier partial submission only when the
      -- already-final row exactly matches the resubmitted values.
      IF v_existing.criteria_scores IS DISTINCT FROM v_scores
        OR v_existing.total_mark IS DISTINCT FROM v_total
        OR v_existing.entry_mode_snapshot IS DISTINCT FROM p_entry_mode
        OR v_existing.max_mark_snapshot IS DISTINCT FROM COALESCE(p_max_mark, 100)
        OR v_existing.criteria_snapshot IS DISTINCT FROM v_snapshot THEN
        RAISE EXCEPTION 'A participant already has different final marks. Ask an administrator to review this entry.' USING ERRCODE = '23514';
      END IF;
      v_already_final_count := v_already_final_count + 1;
    ELSE
      PERFORM public.upsert_judge_mark(
        p_token,
        v_registration_id,
        v_scores,
        v_total,
        'final',
        p_entry_mode,
        p_max_mark,
        v_snapshot
      );
      v_finalized_count := v_finalized_count + 1;
    END IF;

    v_seen_ids := pg_catalog.array_append(v_seen_ids, v_registration_id);
  END LOOP;

  -- One RPC invocation is one Postgres transaction. Any error above rolls back
  -- every mark; token use is committed only with a complete roster submission.
  PERFORM public.expire_judge_token(p_token);

  RETURN pg_catalog.jsonb_build_object(
    'submitted_count', pg_catalog.cardinality(v_roster_ids),
    'finalized_count', v_finalized_count,
    'already_final_count', v_already_final_count,
    'completed', true
  );
END;
$function$;

ALTER FUNCTION public.submit_judge_marks(text, jsonb, text, numeric, jsonb) OWNER TO postgres;
COMMENT ON FUNCTION public.submit_judge_marks(text, jsonb, text, numeric, jsonb)
  IS 'Finalizes a complete token-scoped judge roster atomically and expires its access token in the same transaction.';

REVOKE ALL ON FUNCTION public.submit_judge_marks(text, jsonb, text, numeric, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_judge_marks(text, jsonb, text, numeric, jsonb)
  TO anon, authenticated, service_role;
