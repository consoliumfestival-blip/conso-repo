-- Run against a disposable database after unbounded_code_letters_fixture.sql
-- and 20261026100000_unbounded_code_letters.sql have been applied.
BEGIN;

INSERT INTO public.tenants(id) VALUES
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');
INSERT INTO public.organisations(id, tenant_id) VALUES
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
INSERT INTO public.schedules(id, tenant_id, festival_id, item_id, start_time, end_time) VALUES
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',
   '2026-10-26 09:00+00','2026-10-26 10:00+00'),
  ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002',
   '2026-10-26 09:00+00','2026-10-26 10:00+00'),
  ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003',
   '2026-10-26 09:00+00','2026-10-26 10:00+00');

INSERT INTO public.participants(id, tenant_id, festival_id, organisation_id, chest_number)
SELECT md5('participant-'||n)::uuid, '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','C'||n
FROM generate_series(1,703) n;
INSERT INTO public.registrations(id, participant_id, organisation_id, tenant_id, festival_id, item_id)
SELECT md5('registration-'||n)::uuid, md5('participant-'||n)::uuid,
  '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'
FROM generate_series(1,703) n;

SELECT code_letter_test.assert(code_letter_private.code_at(25)='Z', 'sequence ends first alphabet at Z');
SELECT code_letter_test.assert(code_letter_private.code_at(26)='AA', 'sequence continues at AA');
SELECT code_letter_test.assert(code_letter_private.code_at(701)='ZZ', 'sequence reaches ZZ');
SELECT code_letter_test.assert(code_letter_private.code_at(702)='AAA', 'sequence continues beyond 702 labels');
SELECT code_letter_test.assert(code_letter_private.index_of('AAA')=702, 'multi-letter index round trip');

SELECT code_letter_private.draw('10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', false, false);
SELECT code_letter_test.assert((SELECT count(*)=703 FROM public.registrations
  WHERE item_id='50000000-0000-0000-0000-000000000001' AND code_letter IS NOT NULL),
  'draw assigns all 703 entries');
SELECT code_letter_test.assert((SELECT count(DISTINCT code_letter)=703 FROM public.registrations
  WHERE item_id='50000000-0000-0000-0000-000000000001' AND code_letter IS NOT NULL),
  'draw keeps all 703 labels unique');
SELECT code_letter_test.assert((SELECT count(*)=1 FROM public.registrations
  WHERE item_id='50000000-0000-0000-0000-000000000001' AND code_letter='AAA'),
  'draw reaches the 703rd label AAA');

DO $test$
DECLARE source public.registrations; response jsonb;
BEGIN
  SELECT * INTO source FROM public.registrations
    WHERE id=md5('registration-1')::uuid;
  response := code_letter_private.edit('10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', source.id, 'ZZZZ', source.code_letter, NULL, false);
  PERFORM code_letter_test.assert((SELECT code_letter_fixed AND code_letter='ZZZZ'
    FROM public.registrations WHERE id=source.id), 'manual four-letter assignment is fixed');
  PERFORM code_letter_private.draw('10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', true, false);
  PERFORM code_letter_test.assert((SELECT code_letter_fixed AND code_letter='ZZZZ'
    FROM public.registrations WHERE id=source.id), 'overwrite redraw preserves fixed multi-letter assignment');
END;
$test$;

INSERT INTO public.registrations(id, participant_id, organisation_id, tenant_id, festival_id, item_id, code_letter)
VALUES ('60000000-0000-0000-0000-000000000001', md5('participant-1')::uuid,
  '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','AAAA');
DO $test$
DECLARE source public.registrations;
BEGIN
  SELECT * INTO source FROM public.registrations WHERE id=md5('registration-1')::uuid;
  BEGIN
    PERFORM code_letter_private.edit('10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001', source.id, 'AAAA', source.code_letter, NULL, false);
    RAISE EXCEPTION 'Expected overlapping-event conflict to be rejected';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  PERFORM code_letter_test.assert(true, 'manual edit still rejects overlapping multi-letter conflict');
END;
$test$;

TRUNCATE realtime.broadcasts;
UPDATE public.participants SET chest_number='C1-UPDATED' WHERE id=md5('participant-1')::uuid;
SELECT code_letter_test.assert((SELECT count(*)=1 FROM realtime.broadcasts
  WHERE topic='judge-labels:schedule:30000000-0000-0000-0000-000000000001'),
  'participant chest change notifies its Judge schedule');
SELECT code_letter_test.assert(NOT EXISTS (SELECT 1 FROM realtime.broadcasts
  WHERE topic='code-letters:schedule:30000000-0000-0000-0000-000000000001'),
  'chest-only update does not trigger code-letter consumers');

TRUNCATE realtime.broadcasts;
UPDATE public.registrations SET entry_chest_number='TEAM-CHEST' WHERE id=md5('registration-2')::uuid;
SELECT code_letter_test.assert((SELECT count(*)=1 FROM realtime.broadcasts
  WHERE topic='judge-labels:schedule:30000000-0000-0000-0000-000000000001'),
  'general-entry chest change notifies its Judge schedule');

DO $test$
DECLARE source public.registrations;
BEGIN
  SELECT * INTO source FROM public.registrations WHERE id=md5('registration-1')::uuid;
  BEGIN
    PERFORM code_letter_private.edit('10000000-0000-0000-0000-000000000002',
      '30000000-0000-0000-0000-000000000001', source.id, 'WWWW', source.code_letter, NULL, false);
    RAISE EXCEPTION 'Expected tenant scope check to reject edit';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  UPDATE public.schedules SET is_shuffle_locked=true WHERE id='30000000-0000-0000-0000-000000000001';
  BEGIN
    PERFORM code_letter_private.edit('10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001', source.id, 'WWWW', source.code_letter, NULL, false);
    RAISE EXCEPTION 'Expected shuffle lock to reject edit';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  PERFORM code_letter_test.assert(true, 'tenant scope and schedule lock still reject writes');
END;
$test$;

ROLLBACK;
