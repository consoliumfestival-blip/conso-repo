-- Change participation rules only while an item has no workflow records.
-- The existing metadata edit RPC remains available to older clients.
CREATE FUNCTION public.change_competition_item_type(
  p_festival_id uuid,
  p_item_id uuid,
  p_item_name_ml text,
  p_category_codes text[],
  p_group_member_count integer,
  p_item_type text,
  p_max_participants_per_team integer,
  p_participation_type text,
  p_expected_updated_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner uuid;
  v_item public.items%ROWTYPE;
  v_category_codes text[];
  v_new jsonb;
BEGIN
  SELECT f.tenant_id INTO v_owner
  FROM public.festival_calendar f WHERE f.id = p_festival_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Festival not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM scoring_private.assert_admin(v_owner);

  IF p_participation_type NOT IN ('individual', 'group') OR p_participation_type IS NULL
    OR p_item_id IS NULL OR nullif(btrim(p_item_name_ml), '') IS NULL
    OR p_category_codes IS NULL OR cardinality(p_category_codes) = 0
    OR array_ndims(p_category_codes) <> 1
    OR (p_item_type IS NOT NULL AND p_item_type NOT IN ('stage', 'offstage')) THEN
    RAISE EXCEPTION 'Invalid competition item details.' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(btrim(c.code) ORDER BY c.ordinality)
  INTO v_category_codes
  FROM unnest(p_category_codes) WITH ORDINALITY AS c(code, ordinality);
  IF EXISTS (SELECT 1 FROM unnest(v_category_codes) AS c(code) WHERE nullif(c.code, '') IS NULL)
    OR (SELECT count(*) FROM unnest(v_category_codes)) <>
      (SELECT count(DISTINCT c.code) FROM unnest(v_category_codes) AS c(code)) THEN
    RAISE EXCEPTION 'Category codes must be non-blank and unique.' USING ERRCODE = '22023';
  END IF;
  IF (p_participation_type = 'group' AND
        (p_group_member_count IS NULL OR p_group_member_count < 1 OR p_max_participants_per_team IS NOT NULL))
    OR (p_participation_type = 'individual' AND
        (p_group_member_count IS NOT NULL OR
          (p_max_participants_per_team IS NOT NULL AND p_max_participants_per_team < 1))) THEN
    RAISE EXCEPTION 'Provide the limits required by the selected participation type.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_festival_id::text, 0));
  SELECT * INTO v_item FROM public.items i
  WHERE i.id = p_item_id AND i.festival_id = p_festival_id AND i.tenant_id = v_owner
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competition item not found for this festival.' USING ERRCODE = '42501';
  END IF;
  IF v_item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'This competition changed after it was opened. Reload and try again.' USING ERRCODE = '40001';
  END IF;
  IF v_item.participation_type = p_participation_type THEN
    RAISE EXCEPTION 'Participation type has not changed.' USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE conflicts with FK key-share locks from concurrent inserts.
  -- All direct item references are covered, including non-registration history.
  IF EXISTS (SELECT 1 FROM public.registrations WHERE item_id = p_item_id)
    OR EXISTS (SELECT 1 FROM public.schedules WHERE item_id = p_item_id)
    OR EXISTS (SELECT 1 FROM public.results WHERE item_id = p_item_id)
    OR EXISTS (SELECT 1 FROM public.certificates WHERE item_id = p_item_id)
    OR EXISTS (SELECT 1 FROM public.generated_assets WHERE event_id = p_item_id)
    OR EXISTS (SELECT 1 FROM public.program_intake_statuses WHERE item_id = p_item_id)
    OR EXISTS (SELECT 1 FROM public.scoring_publications WHERE item_id = p_item_id)
    OR EXISTS (SELECT 1 FROM public.team_leader_program_completions WHERE item_id = p_item_id) THEN
    RAISE EXCEPTION 'This competition already has linked records. Create a new item to use a different participation type.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.items
  SET item_name_ml = btrim(p_item_name_ml),
      item_name_en = CASE WHEN item_name_en IS NULL OR item_name_en = item_name_ml
        THEN btrim(p_item_name_ml) ELSE item_name_en END,
      category_codes = v_category_codes,
      participation_type = p_participation_type,
      group_min_members = CASE WHEN p_participation_type = 'group' THEN p_group_member_count ELSE NULL END,
      group_max_members = CASE WHEN p_participation_type = 'group' THEN p_group_member_count ELSE NULL END,
      max_participants_per_team = CASE WHEN p_participation_type = 'individual' THEN p_max_participants_per_team ELSE NULL END,
      item_type = p_item_type,
      updated_at = clock_timestamp()
  WHERE id = p_item_id AND festival_id = p_festival_id AND tenant_id = v_owner;

  SELECT to_jsonb(i) INTO v_new FROM public.items i WHERE i.id = p_item_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_owner, auth.uid(), 'competition_item_participation_type_changed', 'items', p_item_id,
    to_jsonb(v_item), v_new);
END;
$function$;

ALTER FUNCTION public.change_competition_item_type(uuid,uuid,text,text[],integer,text,integer,text,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.change_competition_item_type(uuid,uuid,text,text[],integer,text,integer,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_competition_item_type(uuid,uuid,text,text[],integer,text,integer,text,timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
