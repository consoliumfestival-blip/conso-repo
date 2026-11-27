import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrationUrl = new URL('../migrations/20261127195513_public_candidate_profile_search.sql', import.meta.url);
const id = (number) => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;

test('public candidate search stays team-scoped, profile-gated and fully pageable', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE public.tenants (id uuid PRIMARY KEY, organisation_id uuid, access_disabled boolean DEFAULT false, public_enabled boolean DEFAULT true, participant_results_enabled boolean DEFAULT true);
      CREATE TABLE public.festival_calendar (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, is_active boolean NOT NULL);
      CREATE TABLE public.organisations (id uuid PRIMARY KEY, parent_id uuid, archived_at timestamptz);
      CREATE TABLE public.participants (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, festival_id uuid NOT NULL,
        organisation_id uuid NOT NULL, profile_slug text, name text NOT NULL,
        chest_number text, category_code text, public_profile_enabled boolean
      );
      CREATE FUNCTION public.get_public_tenant_feature_settings(p_tenant_id uuid)
      RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
        SELECT jsonb_build_object(
          'public_page', tenant.public_enabled,
          'sections', jsonb_build_object('results', tenant.participant_results_enabled, 'participant_results', tenant.participant_results_enabled)
        ) FROM public.tenants AS tenant WHERE tenant.id = p_tenant_id
      $$;
      CREATE FUNCTION public.get_public_active_festival_id(p_tenant_id uuid)
      RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
        SELECT festival.id FROM public.festival_calendar AS festival
        JOIN public.tenants AS tenant ON tenant.id = festival.tenant_id
        WHERE festival.tenant_id = p_tenant_id AND festival.is_active AND tenant.public_enabled
        ORDER BY festival.id LIMIT 1
      $$;

      INSERT INTO public.tenants (id, organisation_id) VALUES
        ('${id(1)}', '${id(11)}'), ('${id(2)}', '${id(21)}');
      INSERT INTO public.festival_calendar VALUES
        ('${id(101)}', '${id(1)}', true), ('${id(102)}', '${id(1)}', false), ('${id(201)}', '${id(2)}', true);
      INSERT INTO public.organisations VALUES
        ('${id(11)}', NULL, NULL), ('${id(12)}', '${id(11)}', NULL),
        ('${id(13)}', '${id(12)}', NULL), ('${id(21)}', NULL, NULL),
        ('${id(22)}', '${id(21)}', NULL);

      INSERT INTO public.participants (id, tenant_id, festival_id, organisation_id, profile_slug, name, chest_number, category_code, public_profile_enabled)
      SELECT
        ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
        '${id(1)}', '${id(101)}', '${id(13)}', 'candidate-' || n,
        'Candidate ' || lpad(n::text, 3, '0'), 'CHEST-' || n, 'JUNIOR', true
      FROM generate_series(1, 54) AS n;

      INSERT INTO public.participants VALUES
        ('${id(70)}', '${id(1)}', '${id(101)}', '${id(13)}', 'candidate-null-enabled', 'Candidate allowed null flag', 'CHEST-NULL', 'SENIOR', NULL),
        ('${id(71)}', '${id(1)}', '${id(101)}', '${id(13)}', 'candidate-disabled', 'Candidate hidden profile', 'CHEST-HIDDEN', 'SENIOR', false),
        ('${id(72)}', '${id(1)}', '${id(101)}', '${id(11)}', 'candidate-root', 'Candidate root row', 'CHEST-ROOT', 'SENIOR', true),
        ('${id(73)}', '${id(2)}', '${id(201)}', '${id(22)}', 'candidate-other-tenant', 'Candidate other tenant', 'CHEST-TENANT', 'SENIOR', true),
        ('${id(74)}', '${id(1)}', '${id(102)}', '${id(13)}', 'candidate-other-festival', 'Candidate other festival', 'CHEST-FESTIVAL', 'SENIOR', true),
        ('${id(75)}', '${id(1)}', '${id(101)}', '${id(13)}', NULL, 'Candidate without profile slug', 'CHEST-NOSLUG', 'SENIOR', true),
        ('${id(76)}', '${id(1)}', '${id(101)}', '${id(13)}', 'partial-chest', 'Chest-only match', 'AB-900-Z', 'SENIOR', true);
    `);
    await db.exec(await readFile(migrationUrl, 'utf8'));

    const first = await db.query(`SELECT public.search_public_candidate_profiles($1, NULL, 'candidate', NULL) AS result`, [id(1)]);
    const firstPage = first.rows[0].result;
    assert.equal(firstPage.festival_id, id(101));
    assert.equal(firstPage.items.length, 50);
    assert.equal(firstPage.has_more, true);
    assert.ok(firstPage.next_cursor?.id);

    await db.exec(`UPDATE public.festival_calendar SET is_active = (id = '${id(102)}') WHERE tenant_id = '${id(1)}'`);
    const second = await db.query(`SELECT public.search_public_candidate_profiles($1, $2, 'candidate', $3::jsonb) AS result`, [id(1), firstPage.festival_id, JSON.stringify(firstPage.next_cursor)]);
    const secondPage = second.rows[0].result;
    assert.equal(secondPage.festival_id, firstPage.festival_id);
    assert.equal(secondPage.items.length, 5);
    assert.equal(secondPage.has_more, false);
    assert.equal(secondPage.next_cursor, null);

    const allSlugs = [...firstPage.items, ...secondPage.items].map((candidate) => candidate.slug);
    assert.equal(allSlugs.length, 55);
    assert.equal(new Set(allSlugs).size, 55);
    assert.ok(allSlugs.includes('candidate-null-enabled'));
    assert.ok(!allSlugs.includes('candidate-disabled'));
    assert.ok(!allSlugs.includes('candidate-root'));
    assert.ok(!allSlugs.includes('candidate-other-tenant'));
    assert.ok(!allSlugs.includes('candidate-other-festival'));
    assert.ok(!allSlugs.includes(null));

    const partialChest = await db.query(`SELECT public.search_public_candidate_profiles($1, $2, '900', NULL) AS result`, [id(1), id(101)]);
    assert.deepEqual(partialChest.rows[0].result.items.map((candidate) => candidate.slug), ['partial-chest']);
    const explicitFestival = await db.query(`SELECT public.search_public_candidate_profiles($1, $2, 'festival', NULL) AS result`, [id(1), id(102)]);
    assert.deepEqual(explicitFestival.rows[0].result.items.map((candidate) => candidate.slug), ['candidate-other-festival']);

    await db.exec(`UPDATE public.organisations SET parent_id = '${id(13)}' WHERE id = '${id(11)}'`);
    const cyclicTree = await db.query(`SELECT public.search_public_candidate_profiles($1, NULL, 'candidate root', NULL) AS result`, [id(1)]);
    assert.deepEqual(cyclicTree.rows[0].result.items, []);

    await assert.rejects(db.query(`SELECT public.search_public_candidate_profiles($1, $2, 'candidate', NULL)`, [id(1), id(201)]));
    await assert.rejects(db.query(`SELECT public.search_public_candidate_profiles($1, NULL, ' ', NULL)`, [id(1)]));
    await assert.rejects(db.query(`SELECT public.search_public_candidate_profiles($1, NULL, 'candidate', '{"name":"x","id":"invalid"}'::jsonb)`, [id(1)]));

    const privileges = await db.query(`SELECT
      has_function_privilege('anon', 'public.search_public_candidate_profiles(uuid,uuid,text,jsonb)', 'EXECUTE') AS anon_exec,
      has_function_privilege('authenticated', 'public.search_public_candidate_profiles(uuid,uuid,text,jsonb)', 'EXECUTE') AS authenticated_exec,
      has_table_privilege('anon', 'public.participants', 'SELECT') AS anon_can_read_participants`);
    assert.deepEqual(privileges.rows[0], { anon_exec: true, authenticated_exec: true, anon_can_read_participants: false });

    await db.exec('SET ROLE anon');
    const anonymousResult = await db.query(`SELECT public.search_public_candidate_profiles($1, $2, '900', NULL) AS result`, [id(1), id(101)]);
    assert.deepEqual(anonymousResult.rows[0].result.items.map((candidate) => candidate.slug), ['partial-chest']);
    await db.exec('RESET ROLE');

    await db.exec(`UPDATE public.tenants SET public_enabled = false WHERE id = '${id(1)}'`);
    await assert.rejects(db.query(`SELECT public.search_public_candidate_profiles($1, NULL, 'candidate', NULL)`, [id(1)]));
  } finally {
    await db.close();
  }
});
