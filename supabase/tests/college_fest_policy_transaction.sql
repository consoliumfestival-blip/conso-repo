BEGIN;

SELECT plan(10);

INSERT INTO public.tenants (id, name, org_type, festival_template)
VALUES ('00000000-0000-4000-8000-00000000c001', '[TEST] College policy transaction', 'unit', 'college_fest');

INSERT INTO public.festival_calendar (id, tenant_id, custom_name, festival_template)
VALUES (
  '00000000-0000-4000-8000-00000000c002',
  '00000000-0000-4000-8000-00000000c001',
  '[TEST] College policy transaction',
  'college_fest'
);

SELECT lives_ok(
  $$INSERT INTO public.participants (id, tenant_id, festival_id, name, category_code)
    VALUES ('00000000-0000-4000-8000-00000000c011', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', 'Sub Junior test', 'SUB_JUNIOR')$$,
  'College participant accepts manual SUB_JUNIOR'
);

SELECT lives_ok(
  $$INSERT INTO public.participants (id, tenant_id, festival_id, name, category_code)
    VALUES ('00000000-0000-4000-8000-00000000c012', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', 'Junior test', 'JUNIOR')$$,
  'College participant accepts manual JUNIOR'
);

SELECT lives_ok(
  $$INSERT INTO public.participants (id, tenant_id, festival_id, name, category_code)
    VALUES ('00000000-0000-4000-8000-00000000c013', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', 'Senior test', 'SENIOR')$$,
  'College participant accepts manual SENIOR'
);

SELECT throws_matching(
  $$INSERT INTO public.participants (tenant_id, festival_id, name, category_code)
    VALUES ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', 'Alias test', 'JR')$$,
  'Invalid College Fest category:.*',
  'College participant rejects JR alias'
);

SELECT lives_ok(
  $$INSERT INTO public.items (id, tenant_id, festival_id, item_code, item_name_en, category_codes)
    VALUES ('00000000-0000-4000-8000-00000000c021', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', 'CT-01', 'College test item', ARRAY['SUB_JUNIOR','JUNIOR'])$$,
  'College item accepts canonical category list'
);

SELECT throws_matching(
  $$INSERT INTO public.items (tenant_id, festival_id, item_code, item_name_en, category_codes)
    VALUES ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', 'CT-02', 'Invalid College test item', ARRAY['GN'])$$,
  'Invalid College Fest item category:.*',
  'College item rejects GN category'
);

SELECT lives_ok(
  $$INSERT INTO public.registrations (tenant_id, festival_id, item_id, participant_id)
    VALUES ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000c021', '00000000-0000-4000-8000-00000000c011')$$,
  'College registration accepts matching participant and item category'
);

SELECT throws_matching(
  $$INSERT INTO public.registrations (tenant_id, festival_id, item_id, participant_id)
    VALUES ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000c021', '00000000-0000-4000-8000-00000000c013')$$,
  'College Fest registration category mismatch:.*',
  'College registration rejects category mismatch'
);

SELECT results_eq(
  $$SELECT category_code FROM public.participants
    WHERE festival_id = '00000000-0000-4000-8000-00000000c002'
    ORDER BY category_code$$,
  $$VALUES ('JUNIOR'::text), ('SENIOR'::text), ('SUB_JUNIOR'::text)$$,
  'College manual categories are stored exactly'
);

SELECT is(
  (SELECT festival_template FROM public.festival_calendar WHERE id = '00000000-0000-4000-8000-00000000c002'),
  'college_fest'::text,
  'College festival template snapshot is authoritative'
);

SELECT * FROM finish();
ROLLBACK;
