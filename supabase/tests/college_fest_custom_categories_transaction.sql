BEGIN;
SELECT plan(12);

INSERT INTO public.tenants (id, name, org_type, festival_template)
VALUES
  ('00000000-0000-4000-8000-000000001061', '[TEST] Custom category tenant', 'unit', 'college_fest'),
  ('00000000-0000-4000-8000-000000001062', '[TEST] Foreign tenant', 'unit', 'college_fest');
INSERT INTO public.festival_calendar (id, tenant_id, custom_name, festival_template)
VALUES
  ('00000000-0000-4000-8000-000000001063', '00000000-0000-4000-8000-000000001061', '[TEST] Custom categories', 'college_fest'),
  ('00000000-0000-4000-8000-000000001064', '00000000-0000-4000-8000-000000001062', '[TEST] Foreign categories', 'college_fest');

SELECT lives_ok($$INSERT INTO public.festival_categories
  (id, tenant_id, festival_id, name, code, sort_order) VALUES
  ('00000000-0000-4000-8000-000000001071','00000000-0000-4000-8000-000000001061','00000000-0000-4000-8000-000000001063','Junior','junior',2)$$,
  'creates a custom category');
SELECT lives_ok($$INSERT INTO public.festival_categories
  (id, tenant_id, festival_id, name, code, sort_order) VALUES
  ('00000000-0000-4000-8000-000000001072','00000000-0000-4000-8000-000000001061','00000000-0000-4000-8000-000000001063','Open','open',1)$$,
  'creates an additional custom category');
SELECT throws_ok($$INSERT INTO public.festival_categories
  (tenant_id,festival_id,name,code) VALUES
  ('00000000-0000-4000-8000-000000001061','00000000-0000-4000-8000-000000001063','Junior','junior_two')$$,
  '23505', NULL, 'rejects duplicate active name');
SELECT throws_ok($$INSERT INTO public.festival_categories
  (tenant_id,festival_id,name,code) VALUES
  ('00000000-0000-4000-8000-000000001061','00000000-0000-4000-8000-000000001063','Junior Two','junior')$$,
  '23505', NULL, 'rejects duplicate festival code');
SELECT results_eq($$SELECT code FROM public.festival_categories
  WHERE festival_id='00000000-0000-4000-8000-000000001063' ORDER BY sort_order,name$$,
  $$VALUES ('open'::text),('junior'::text)$$, 'sorts by order then name');
SELECT lives_ok($$UPDATE public.festival_categories SET name='Junior Renamed'
  WHERE id='00000000-0000-4000-8000-000000001071'$$, 'edits display name');
SELECT is((SELECT code FROM public.festival_categories WHERE id='00000000-0000-4000-8000-000000001071'),
  'junior'::text, 'display-name edit preserves code');
SELECT lives_ok($$INSERT INTO public.participants
  (id,tenant_id,festival_id,name,category_code) VALUES
  ('00000000-0000-4000-8000-000000001081','00000000-0000-4000-8000-000000001061','00000000-0000-4000-8000-000000001063','Custom participant','junior')$$,
  'participant accepts active custom category');
SELECT throws_matching($$INSERT INTO public.participants
  (tenant_id,festival_id,name,category_code) VALUES
  ('00000000-0000-4000-8000-000000001062','00000000-0000-4000-8000-000000001063','Foreign tenant','junior')$$,
  'Selected College Fest category is invalid.*', 'rejects foreign tenant category');
SELECT lives_ok($$UPDATE public.festival_categories SET is_active=false
  WHERE id='00000000-0000-4000-8000-000000001071'$$, 'archives referenced category');
SELECT throws_matching($$INSERT INTO public.participants
  (tenant_id,festival_id,name,category_code) VALUES
  ('00000000-0000-4000-8000-000000001061','00000000-0000-4000-8000-000000001063','Archived category','junior')$$,
  'Selected College Fest category is invalid.*', 'rejects archived category for new participant');
SELECT lives_ok($$UPDATE public.festival_categories SET is_active=true
  WHERE id='00000000-0000-4000-8000-000000001071'$$, 'restores category');

SELECT * FROM finish();
ROLLBACK;
