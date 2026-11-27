-- Run after the Smart Announcer schema fixture, sequential strategy migration,
-- and dynamic-order migration in a disposable PostgreSQL database.
BEGIN;
INSERT INTO items VALUES (md5('non-target-result')::uuid, md5('tenant')::uuid,
  md5('festival')::uuid, 'Non-target result', NULL, 'non-target-result', ARRAY['GN']);
INSERT INTO registrations VALUES
  (md5('non-target-A')::uuid, md5('non-target-result')::uuid, NULL, md5('A')::uuid, 'approved'),
  (md5('non-target-B')::uuid, md5('non-target-result')::uuid, NULL, md5('B')::uuid, 'approved');
INSERT INTO results VALUES
  (md5('non-target-result-A')::uuid, md5('non-target-result')::uuid, md5('non-target-A')::uuid,
    md5('festival')::uuid, 0, 4, 'C', true, 'published', false, now()),
  (md5('non-target-result-B')::uuid, md5('non-target-result')::uuid, md5('non-target-B')::uuid,
    md5('festival')::uuid, 7, 1, 'A', true, 'published', false, now());
DO $teams$
DECLARE n integer;
BEGIN
  FOR n IN 1..18 LOOP
    INSERT INTO organisations VALUES (md5('extra-team-' || n)::uuid, md5('tenant')::uuid,
      NULL, 'Extra team ' || n, 'unit');
    INSERT INTO registrations VALUES (md5('extra-registration-' || n)::uuid,
      md5('non-target-result')::uuid, NULL, md5('extra-team-' || n)::uuid, 'approved');
    INSERT INTO results VALUES (md5('extra-result-' || n)::uuid, md5('non-target-result')::uuid,
      md5('extra-registration-' || n)::uuid, md5('festival')::uuid, n, 4, 'C', true,
      'published', false, now());
  END LOOP;
END;
$teams$;

DO $test$
DECLARE candidates integer; strategy jsonb; first_item uuid;
BEGIN
  IF (SELECT count(*) FROM smart_announcer_teams(md5('tenant')::uuid, md5('festival')::uuid)) <> 20 THEN
    RAISE EXCEPTION 'Expected the existing module team selector to support all 20 teams';
  END IF;
  SELECT count(*) INTO candidates FROM smart_announcer_team_candidates(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid
  );
  IF candidates < 3 THEN RAISE EXCEPTION 'Some eligible results were omitted'; END IF;
  IF (SELECT count(*) FROM smart_announcer_team_candidates(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid
  ) WHERE id IN (md5('large')::uuid, md5('next')::uuid, md5('non-target-result')::uuid)) <> 3 THEN
    RAISE EXCEPTION 'An eligible unpublished or non-target-only result was omitted';
  END IF;
  IF EXISTS (SELECT 1 FROM smart_announcer_team_candidates(
    md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid
  ) WHERE id = md5('base')::uuid) THEN
    RAISE EXCEPTION 'Already public item was included';
  END IF;
  strategy := smart_announcer_team_strategy(md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid);
  first_item := (strategy->'items'->0->>'item_id')::uuid;
  IF first_item = md5('non-target-result')::uuid THEN
    RAISE EXCEPTION 'A non-target-only result displaced the selected-team first-place priority';
  END IF;
  IF strategy->>'selection_note' IS NULL OR strategy->>'search_width' IS NULL THEN
    RAISE EXCEPTION 'Dynamic recommendation metadata missing: %', strategy;
  END IF;
END;
$test$;

-- The optimizer evaluates a five-item batch plus up to five more eligible
-- results for sustainability, but exposes only the next five items to the queue.
DO $test$
DECLARE n integer; strategy jsonb;
BEGIN
  FOR n IN 1..6 LOOP
    INSERT INTO items VALUES (md5('ahead-item-' || n)::uuid, md5('tenant')::uuid,
      md5('festival')::uuid, 'Ahead ' || n, NULL, 'ahead-' || n, ARRAY['GN']);
    INSERT INTO registrations VALUES
      (md5('ahead-A-' || n)::uuid, md5('ahead-item-' || n)::uuid, NULL, md5('A')::uuid, 'approved'),
      (md5('ahead-B-' || n)::uuid, md5('ahead-item-' || n)::uuid, NULL, md5('B')::uuid, 'approved');
    INSERT INTO results VALUES
      (md5('ahead-result-A-' || n)::uuid, md5('ahead-item-' || n)::uuid, md5('ahead-A-' || n)::uuid,
        md5('festival')::uuid, 1, 4, 'C', true, 'published', false, now()),
      (md5('ahead-result-B-' || n)::uuid, md5('ahead-item-' || n)::uuid, md5('ahead-B-' || n)::uuid,
        md5('festival')::uuid, 0, 4, 'C', true, 'published', false, now());
  END LOOP;
  strategy := smart_announcer_team_strategy(md5('tenant')::uuid, md5('festival')::uuid, md5('A')::uuid);
  IF jsonb_array_length(strategy->'items') <> 5 OR (strategy->>'lookahead_steps')::integer < 1 THEN
    RAISE EXCEPTION 'Expected a five-result batch with sustainability lookahead: %', strategy;
  END IF;
END;
$test$;

-- A result made public after preview cannot be selected at send time.
UPDATE results SET public_visible = true
WHERE item_id = md5('large')::uuid AND registration_id = md5('largeA')::uuid;
DO $test$
BEGIN
  BEGIN
    PERFORM smart_announcer_team_strategy(md5('tenant')::uuid, md5('festival')::uuid,
      md5('A')::uuid, ARRAY[md5('large')::uuid]);
    RAISE EXCEPTION 'Partially public item was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$test$;
ROLLBACK;
SELECT 'dynamic announcer order checks passed' AS result;
