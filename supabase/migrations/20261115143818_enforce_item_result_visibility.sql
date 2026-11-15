-- A visibility change applies to all currently published results for the same
-- tenant, festival and item. Scoring and award columns are never changed.
CREATE FUNCTION public.enforce_item_result_visibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE change record;
BEGIN
  -- The internal update below must not recursively apply the rule again.
  IF pg_catalog.pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF EXISTS (
    SELECT 1 FROM new_result_rows n JOIN old_result_rows o ON o.id = n.id
    WHERE n.item_id IS NOT NULL AND (n.published IS TRUE OR o.published IS TRUE)
      AND EXISTS (SELECT 1 FROM new_result_rows changed JOIN old_result_rows previous ON previous.id = changed.id
        WHERE changed.tenant_id = n.tenant_id AND changed.festival_id = n.festival_id AND changed.item_id = n.item_id
          AND changed.public_visible IS DISTINCT FROM previous.public_visible)
    GROUP BY n.tenant_id, n.festival_id, n.item_id
    HAVING count(DISTINCT COALESCE(n.public_visible, false)) > 1
  ) THEN
    RAISE EXCEPTION 'A competition cannot be shown and hidden in the same operation.' USING ERRCODE = '22023';
  END IF;
  FOR change IN
    SELECT n.tenant_id, n.festival_id, n.item_id, bool_or(COALESCE(n.public_visible, false)) AS make_public
    FROM new_result_rows n JOIN old_result_rows o ON o.id = n.id
    WHERE n.public_visible IS DISTINCT FROM o.public_visible
      AND n.item_id IS NOT NULL AND (n.published IS TRUE OR o.published IS TRUE)
    GROUP BY n.tenant_id, n.festival_id, n.item_id
    ORDER BY n.tenant_id, n.festival_id, n.item_id
  LOOP
    -- A service-role connection already has unrestricted database authority.
    -- All ordinary sessions must still pass the tenant/festival admin check.
    IF pg_catalog.current_setting('role', true) IS DISTINCT FROM 'service_role'
       AND session_user <> 'service_role' THEN
      PERFORM public.smart_announcer_assert_admin(change.tenant_id, change.festival_id);
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item-result-visibility:' || change.tenant_id::text || ':' || change.festival_id::text || ':' || change.item_id::text, 0));
    UPDATE public.results r SET public_visible = change.make_public
    WHERE r.tenant_id = change.tenant_id AND r.festival_id = change.festival_id
      AND r.item_id = change.item_id AND r.published IS TRUE AND r.result_status = 'published'
      AND COALESCE(r.public_visible, false) IS DISTINCT FROM change.make_public;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_item_result_visibility() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_item_result_visibility
AFTER UPDATE ON public.results
REFERENCING OLD TABLE AS old_result_rows NEW TABLE AS new_result_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_item_result_visibility();

-- Newly published rows must not introduce a partial state, including during a
-- scoring publication that inserts new participants alongside existing rows.
CREATE FUNCTION public.enforce_inserted_item_result_visibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE change record;
BEGIN
  IF pg_catalog.pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF EXISTS (
    SELECT 1 FROM inserted_result_rows n
    WHERE n.item_id IS NOT NULL AND n.published IS TRUE AND n.result_status = 'published'
    GROUP BY n.tenant_id, n.festival_id, n.item_id
    HAVING count(DISTINCT COALESCE(n.public_visible, false)) > 1
  ) THEN
    RAISE EXCEPTION 'A competition cannot be shown and hidden in the same operation.' USING ERRCODE = '22023';
  END IF;
  FOR change IN
    SELECT n.tenant_id, n.festival_id, n.item_id, bool_or(COALESCE(n.public_visible, false)) AS make_public
    FROM inserted_result_rows n
    WHERE n.item_id IS NOT NULL AND n.published IS TRUE AND n.result_status = 'published'
    GROUP BY n.tenant_id, n.festival_id, n.item_id
    ORDER BY n.tenant_id, n.festival_id, n.item_id
  LOOP
    IF pg_catalog.current_setting('role', true) IS DISTINCT FROM 'service_role'
       AND session_user <> 'service_role' THEN
      PERFORM public.smart_announcer_assert_admin(change.tenant_id, change.festival_id);
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item-result-visibility:' || change.tenant_id::text || ':' || change.festival_id::text || ':' || change.item_id::text, 0));
    UPDATE public.results r SET public_visible = change.make_public
    WHERE r.tenant_id = change.tenant_id AND r.festival_id = change.festival_id
      AND r.item_id = change.item_id AND r.published IS TRUE AND r.result_status = 'published'
      AND COALESCE(r.public_visible, false) IS DISTINCT FROM change.make_public;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_inserted_item_result_visibility() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_inserted_item_result_visibility
AFTER INSERT ON public.results
REFERENCING NEW TABLE AS inserted_result_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_inserted_item_result_visibility();
