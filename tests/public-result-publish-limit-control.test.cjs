const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const root = path.resolve(__dirname, '..');
const migrationSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261128152000_public_result_publish_limit_control.sql'),
  'utf8',
);

async function setupDatabase() {
  const db = new PGlite();
  const tenantId = id(1);
  const festivalId = id(10);
  const orgA = id(101);
  const orgB = id(102);
  const item1 = id(201);
  const item2 = id(202);
  const item3 = id(203);
  const candA1 = id(301);
  const candB1 = id(302);
  const reg1 = id(401);
  const reg2 = id(402);
  const reg3 = id(403);
  const res1 = id(501);
  const res2 = id(502);
  const res3 = id(503);
  const adminUser = id(901);
  const leaderUser = id(902);

  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS group_entry_private;

    CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.user_id', true), '')::uuid
    $$;

    CREATE TABLE public.tenants (
      id uuid PRIMARY KEY,
      name text
    );
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      role text,
      tenant_id uuid,
      is_superadmin boolean DEFAULT false
    );
    CREATE TABLE public.festival_calendar (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      custom_name text,
      level text,
      festival_year integer,
      start_date date,
      is_active boolean DEFAULT true
    );
    CREATE TABLE public.festival_leaderboard_settings (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      festival_id uuid NOT NULL UNIQUE,
      is_public_visible boolean NOT NULL DEFAULT false,
      show_individual_rankings boolean NOT NULL DEFAULT true,
      show_competition_points_grades boolean NOT NULL DEFAULT true,
      team_point_status text,
      public_festival_name text,
      theme_config jsonb DEFAULT '{}'::jsonb,
      ranking_mode text DEFAULT 'ALL',
      item_limit integer
    );
    CREATE TABLE public.organisations (
      id uuid PRIMARY KEY,
      tenant_id uuid,
      parent_id uuid,
      name text,
      org_type text
    );
    CREATE TABLE public.items (
      id uuid PRIMARY KEY,
      tenant_id uuid,
      festival_id uuid,
      item_code text,
      item_name_en text,
      item_name_ml text,
      participation_type text DEFAULT 'individual',
      category_codes text[] DEFAULT ARRAY['SR']::text[]
    );
    CREATE TABLE public.participants (
      id uuid PRIMARY KEY,
      tenant_id uuid,
      festival_id uuid,
      organisation_id uuid,
      name text,
      chest_number text,
      category_code text,
      profile_slug text,
      profile_bio text,
      photo_url text,
      status text DEFAULT 'approved',
      is_terminated boolean DEFAULT false,
      public_profile_enabled boolean DEFAULT true,
      show_organisation_public boolean DEFAULT true
    );
    CREATE TABLE public.registrations (
      id uuid PRIMARY KEY,
      tenant_id uuid,
      festival_id uuid,
      item_id uuid,
      participant_id uuid,
      organisation_id uuid,
      entry_kind text DEFAULT 'individual',
      status text DEFAULT 'registered'
    );
    CREATE TABLE public.group_members (
      id uuid PRIMARY KEY,
      registration_id uuid,
      participant_id uuid
    );
    CREATE TABLE public.results (
      id uuid PRIMARY KEY,
      tenant_id uuid,
      festival_id uuid,
      item_id uuid,
      registration_id uuid,
      rank integer,
      grade text,
      points_awarded integer,
      published boolean DEFAULT false,
      result_status text DEFAULT 'draft',
      public_visible boolean DEFAULT false,
      published_at timestamptz,
      public_result_no integer
    );
    CREATE TABLE public.result_team_awards (
      id uuid PRIMARY KEY,
      result_id uuid,
      organisation_id uuid
    );
    CREATE TABLE public.points_config (
      id uuid PRIMARY KEY,
      festival_id uuid,
      config_version integer DEFAULT 1,
      enable_grace_marks boolean DEFAULT false
    );
    CREATE TABLE public.grace_marks (
      id uuid PRIMARY KEY,
      tenant_id uuid,
      festival_id uuid,
      org_id uuid,
      points integer,
      submission_id uuid
    );
    CREATE TABLE public.schedules (
      id uuid PRIMARY KEY,
      festival_id uuid,
      item_id uuid,
      venue_id uuid,
      status text
    );
    CREATE TABLE public.generated_assets (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      festival_id uuid NOT NULL,
      render_hash text,
      event_id uuid,
      result_id uuid,
      event_name text,
      resolution text DEFAULT 'hd',
      public_url text,
      storage_path text,
      is_current boolean DEFAULT true,
      visibility_status text DEFAULT 'published',
      created_at timestamptz DEFAULT now()
    );

    CREATE FUNCTION group_entry_private.display_name(r public.registrations)
    RETURNS text LANGUAGE sql STABLE AS $$ SELECT ''::text $$;
    CREATE FUNCTION group_entry_private.chest_number(r public.registrations)
    RETURNS text LANGUAGE sql STABLE AS $$ SELECT ''::text $$;
    CREATE FUNCTION group_entry_private.category_code(r public.registrations)
    RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

    CREATE FUNCTION public.tenant_module_enabled(p_tenant_id uuid, p_module text)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.tenant_module_section_enabled(p_tenant_id uuid, p_module text, p_section text)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.public_page_media_enabled(p_tenant_id uuid)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

    -- Stubs matching 20261024063824 / 20261117024449 prior to applying our migration
    CREATE FUNCTION public.get_public_leaderboard_settings(p_tenant_id uuid DEFAULT NULL, p_festival_id uuid DEFAULT NULL)
    RETURNS TABLE(
      festival_id uuid, festival_level text, is_public_visible boolean,
      show_individual_rankings boolean, show_competition_points_grades boolean,
      team_point_status text, public_festival_name text, theme_config jsonb
    ) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      RETURN QUERY SELECT '${festivalId}'::uuid, 'campus', true, true, true, NULL::text, 'Consoulium', '{}'::jsonb;
    END;
    $$;

    CREATE FUNCTION public.get_public_leaderboard_unmasked(p_tenant_id uuid DEFAULT NULL, p_festival_id uuid DEFAULT NULL)
    RETURNS TABLE(
      organisation_id uuid, organisation_name text, organisation_type text, parent_id uuid,
      total_points bigint, first_place_count bigint, second_place_count bigint, third_place_count bigint,
      grade_a_plus_count bigint, grade_a_count bigint, grade_b_count bigint, grade_c_count bigint,
      result_count bigint, latest_published_at timestamptz, grace_marks_awarded bigint
    ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    DECLARE
      v_ranking_mode text;
      v_item_limit integer;
    BEGIN
      SELECT COALESCE(ranking_mode, 'ALL'), item_limit
      INTO v_ranking_mode, v_item_limit
      FROM festival_leaderboard_settings WHERE festival_id = p_festival_id LIMIT 1;

      RETURN QUERY
      WITH limited_items AS (
        SELECT item_id FROM results
        WHERE festival_id = p_festival_id AND published IS TRUE
          AND COALESCE(result_status, 'draft') IN ('published', 'ready')
          AND COALESCE(public_visible, false) IS TRUE
        GROUP BY item_id
        ORDER BY MIN(published_at) ASC, item_id ASC
        LIMIT (CASE WHEN COALESCE(v_ranking_mode, 'ALL') = 'LIMITED' AND v_item_limit > 0 THEN v_item_limit ELSE 999999 END)
      )
      SELECT
        org.id, org.name, org.org_type, org.parent_id,
        COALESCE(SUM(res.points_awarded), 0)::bigint,
        COUNT(*) FILTER (WHERE res.rank = 1)::bigint,
        COUNT(*) FILTER (WHERE res.rank = 2)::bigint,
        COUNT(*) FILTER (WHERE res.rank = 3)::bigint,
        COUNT(*) FILTER (WHERE res.grade = 'A+')::bigint,
        COUNT(*) FILTER (WHERE res.grade = 'A')::bigint,
        COUNT(*) FILTER (WHERE res.grade = 'B')::bigint,
        COUNT(*) FILTER (WHERE res.grade = 'C')::bigint,
        COUNT(*)::bigint,
        MAX(res.published_at),
        0::bigint
      FROM results res
      JOIN registrations reg ON reg.id = res.registration_id
      JOIN organisations org ON org.id = reg.organisation_id
      WHERE res.festival_id = p_festival_id AND res.published IS TRUE AND res.public_visible IS TRUE
        AND res.item_id IN (SELECT item_id FROM limited_items)
      GROUP BY org.id, org.name, org.org_type, org.parent_id
      ORDER BY 5 DESC, org.name ASC;
    END;
    $$;

    CREATE FUNCTION public.get_leaderboard_preview(
      p_tenant_id uuid, p_festival_id uuid, p_ranking_mode text, p_item_limit integer, p_use_public_only boolean DEFAULT false
    )
    RETURNS TABLE(organisation_id uuid, organisation_name text, total_points bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    BEGIN
      RETURN QUERY
      WITH limited_items AS (
        SELECT item_id FROM results
        WHERE festival_id = p_festival_id AND published IS TRUE
          AND (NOT p_use_public_only OR COALESCE(public_visible, false) IS TRUE)
        GROUP BY item_id
        ORDER BY MIN(published_at) ASC, item_id ASC
        LIMIT (CASE WHEN COALESCE(p_ranking_mode, 'ALL') = 'LIMITED' AND p_item_limit > 0 THEN p_item_limit ELSE 999999 END)
      )
      SELECT org.id, org.name, COALESCE(SUM(res.points_awarded), 0)::bigint
      FROM results res
      JOIN registrations reg ON reg.id = res.registration_id
      JOIN organisations org ON org.id = reg.organisation_id
      WHERE res.festival_id = p_festival_id AND res.published IS TRUE
        AND (NOT p_use_public_only OR COALESCE(res.public_visible, false) IS TRUE)
        AND res.item_id IN (SELECT item_id FROM limited_items)
      GROUP BY org.id, org.name
      ORDER BY 3 DESC;
    END;
    $$;

    -- Baseline functions before migration under test
    CREATE FUNCTION public.get_public_published_results(
      p_tenant_id uuid DEFAULT NULL, p_festival_id uuid DEFAULT NULL, p_include_participant_details boolean DEFAULT true
    )
    RETURNS TABLE(
      result_id uuid, registration_id uuid, item_id uuid, item_name text, item_name_ml text,
      is_group boolean, item_category_codes text[], organisation_id uuid, organisation_name text,
      organisation_type text, participant_id uuid, participant_name text, participant_profile_slug text,
      chest_number text, participant_category_code text, rank integer, grade text,
      points_awarded integer, published_at timestamptz, festival_level text, public_result_no integer
    ) LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text, false, ARRAY[]::text[], NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer, NULL::text, NULL::integer, NULL::timestamptz, NULL::text, NULL::integer WHERE false $$;

    CREATE FUNCTION public.get_public_published_results_scoped(p_tenant_id uuid, p_festival_id uuid, p_include_participant_details boolean DEFAULT true)
    RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      SELECT to_jsonb(r) FROM public.get_public_published_results(p_tenant_id, p_festival_id, p_include_participant_details) r;
    $$;

    CREATE FUNCTION public.get_public_participant_results_scoped(p_tenant_id uuid, p_festival_id uuid)
    RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      SELECT to_jsonb(r) FROM public.get_public_published_results(p_tenant_id, p_festival_id, true) r;
    $$;

    CREATE FUNCTION public.get_team_leader_context()
    RETURNS TABLE(parent_tenant_id uuid, festival_id uuid, organisation_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT '${tenantId}'::uuid, '${festivalId}'::uuid, '${orgA}'::uuid
    $$;

    CREATE FUNCTION public.get_team_leader_published_results()
    RETURNS TABLE(result_id uuid, item_id uuid, item_name text, participant_name text, rank integer, points_awarded integer)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      SELECT r.result_id, r.item_id, r.item_name, r.participant_name, r.rank, r.points_awarded
      FROM public.get_team_leader_context() c
      JOIN public.get_public_published_results(c.parent_tenant_id, c.festival_id, true) r
        ON r.organisation_id = c.organisation_id;
    $$;

    CREATE FUNCTION public.is_public_published_poster_result(p_event_id uuid, p_result_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT true $$;

    ALTER TABLE public.generated_assets ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Admins can manage generated_assets"
      ON public.generated_assets FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.tenant_id = generated_assets.tenant_id));
    CREATE POLICY "Public can view generated_assets"
      ON public.generated_assets FOR SELECT TO anon, authenticated
      USING (
        is_current = true AND visibility_status = 'published'
        AND ((event_id IS NULL AND result_id IS NULL) OR public.is_public_published_poster_result(event_id, result_id))
      );

    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT SELECT ON public.generated_assets TO anon, authenticated;
    GRANT SELECT ON public.profiles TO authenticated;

    CREATE VIEW public.vw_public_results AS SELECT 1 AS placeholder;
    CREATE VIEW public.vw_public_leaderboard AS SELECT 1 AS placeholder;
    CREATE VIEW public.vw_public_live_status AS SELECT 1 AS placeholder;
    CREATE VIEW public.vw_public_participants AS SELECT 1 AS placeholder;
    DROP VIEW public.vw_public_results, public.vw_public_leaderboard, public.vw_public_live_status, public.vw_public_participants;

    INSERT INTO public.tenants VALUES ('${tenantId}', 'Consoulium Tenant');
    INSERT INTO public.profiles VALUES ('${adminUser}', 'admin', '${tenantId}', false), ('${leaderUser}', 'team_leader', '${tenantId}', false);
    INSERT INTO public.festival_calendar VALUES ('${festivalId}', '${tenantId}', 'CONSOULIUM 2K26', 'campus', 2026, '2026-11-28', true);
    INSERT INTO public.festival_leaderboard_settings VALUES ('${id(20)}', '${tenantId}', '${festivalId}', true, true, true, '60', 'CONSOULIUM 2K26', '{}'::jsonb, 'LIMITED', 2);
    INSERT INTO public.organisations VALUES ('${orgA}', '${tenantId}', NULL, 'Unit Alpha', 'unit'), ('${orgB}', '${tenantId}', NULL, 'Unit Beta', 'unit');
    INSERT INTO public.items VALUES
      ('${item1}', '${tenantId}', '${festivalId}', 'IT-01', 'Song', 'പാട്ട്', 'individual', ARRAY['SR']::text[]),
      ('${item2}', '${tenantId}', '${festivalId}', 'IT-02', 'Speech', 'പ്രസംഗം', 'individual', ARRAY['SR']::text[]),
      ('${item3}', '${tenantId}', '${festivalId}', 'IT-03', 'Essay', 'ഉപന്യാസം', 'individual', ARRAY['SR']::text[]);
    INSERT INTO public.participants VALUES
      ('${candA1}', '${tenantId}', '${festivalId}', '${orgA}', 'Alice', '101', 'SR', 'alice-101', 'Bio', NULL, 'approved', false, true, true),
      ('${candB1}', '${tenantId}', '${festivalId}', '${orgB}', 'Bob', '102', 'SR', 'bob-102', 'Bio', NULL, 'approved', false, true, true);
    INSERT INTO public.registrations VALUES
      ('${reg1}', '${tenantId}', '${festivalId}', '${item1}', '${candA1}', '${orgA}', 'individual', 'registered'),
      ('${reg2}', '${tenantId}', '${festivalId}', '${item2}', '${candB1}', '${orgB}', 'individual', 'registered'),
      ('${reg3}', '${tenantId}', '${festivalId}', '${item3}', '${candA1}', '${orgA}', 'individual', 'registered');
    INSERT INTO public.results VALUES
      ('${res1}', '${tenantId}', '${festivalId}', '${item1}', '${reg1}', 1, 'A', 5, true, 'published', true, '2026-11-28T10:00:00Z', 1),
      ('${res2}', '${tenantId}', '${festivalId}', '${item2}', '${reg2}', 1, 'A', 5, true, 'published', true, '2026-11-28T10:05:00Z', 2),
      ('${res3}', '${tenantId}', '${festivalId}', '${item3}', '${reg3}', 1, 'A+', 10, true, 'published', true, '2026-11-28T10:10:00Z', 3);
    INSERT INTO public.generated_assets VALUES
      ('${id(601)}', '${tenantId}', '${festivalId}', 'poster_item1', '${item1}', '${res1}', 'Song', 'hd', 'https://cdn.example/1.png', NULL, true, 'published', '2026-11-28T10:01:00Z'),
      ('${id(602)}', '${tenantId}', '${festivalId}', 'poster_item2', '${item2}', '${res2}', 'Speech', 'hd', 'https://cdn.example/2.png', NULL, true, 'published', '2026-11-28T10:06:00Z'),
      ('${id(603)}', '${tenantId}', '${festivalId}', 'poster_item3', '${item3}', '${res3}', 'Essay', 'hd', 'https://cdn.example/3.png', NULL, true, 'published', '2026-11-28T10:11:00Z'),
      ('${id(604)}', '${tenantId}', '${festivalId}', 'manual_media_1', NULL, NULL, 'Stage Gallery', 'hd', 'https://cdn.example/g.png', NULL, true, 'published', '2026-11-28T10:12:00Z');
  `);

  await db.exec(migrationSql);

  await db.exec(`
    GRANT SELECT ON public.vw_public_results, public.vw_public_leaderboard, public.vw_public_live_status, public.vw_public_participants TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_public_published_results(uuid, uuid, boolean) TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.get_public_published_results_scoped(uuid, uuid, boolean) TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.get_public_participant_results_scoped(uuid, uuid) TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.get_public_candidate_profile(text) TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.get_public_unit_profile(uuid) TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.get_team_leader_published_results() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.get_public_leaderboard_unmasked(uuid, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.get_leaderboard_preview(uuid, uuid, text, integer, boolean) TO authenticated;
  `);

  return { db, tenantId, festivalId, orgA, orgB, item1, item2, item3, res1, res2, res3, adminUser };
}

test('parallel compatibility: default limit_public_results=false keeps legacy results & posters unlimited while leaderboard stays capped', async () => {
  const { db, tenantId, festivalId, orgA, item1, item2, item3 } = await setupDatabase();
  try {
    const settingsRes = await db.query('SELECT * FROM public.get_public_leaderboard_settings($1, $2)', [tenantId, festivalId]);
    assert.equal(settingsRes.rows[0].ranking_mode, 'LIMITED');
    assert.equal(settingsRes.rows[0].item_limit, 2);
    assert.equal(settingsRes.rows[0].limit_public_results, false);

    // Leaderboard counts only items 1 & 2 (5 pts each -> Unit Alpha 5, Unit Beta 5; item 3's 10 pts excluded)
    const lb = await db.query('SELECT organisation_id, total_points FROM public.get_public_leaderboard_unmasked($1, $2)', [tenantId, festivalId]);
    assert.equal(Number(lb.rows.find((r) => r.organisation_id === orgA).total_points), 5);

    // Under legacy default (limit_public_results = false), all 3 items appear in public results, profiles, views, and posters
    const pubRes = await db.query('SELECT item_id FROM public.get_public_published_results($1, $2, true)', [tenantId, festivalId]);
    assert.deepEqual(new Set(pubRes.rows.map((r) => r.item_id)), new Set([item1, item2, item3]));

    await db.exec('SET ROLE anon');
    const vwRes = await db.query('SELECT item_id FROM public.vw_public_results WHERE festival_id = $1', [festivalId]);
    assert.equal(vwRes.rows.length, 3);
    const assetsRes = await db.query('SELECT render_hash FROM public.generated_assets WHERE festival_id = $1 ORDER BY created_at ASC', [festivalId]);
    assert.deepEqual(assetsRes.rows.map((r) => r.render_hash), ['poster_item1', 'poster_item2', 'poster_item3', 'manual_media_1']);
  } finally {
    await db.close();
  }
});

test('toggle ON (limit_public_results=true): public results, profiles, views, Team Leader results, and public posters match capped leaderboard while admin preview & Poster Studio stay intact', async () => {
  const { db, tenantId, festivalId, orgA, item1, item2, item3, adminUser } = await setupDatabase();
  try {
    await db.query('UPDATE public.festival_leaderboard_settings SET limit_public_results = true WHERE festival_id = $1', [festivalId]);

    // Helper functions must NOT be callable directly by anon
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM public.get_public_leaderboard_included_item_ids($1)', [festivalId]), /permission denied/);
    await assert.rejects(db.query('SELECT public.is_public_result_item_allowed($1, $2)', [festivalId, item1]), /permission denied/);

    // Public AI leaderboard view reflects only the first 2 items
    const vwLb = await db.query('SELECT organisation_id, total_points FROM public.vw_public_leaderboard WHERE festival_id = $1', [festivalId]);
    assert.equal(Number(vwLb.rows.find((r) => r.organisation_id === orgA).total_points), 5);

    // Public published results, participant results, candidate profile, unit profile all strictly exclude item 3
    const pubRes = await db.query("SELECT (r->>'item_id')::uuid AS item_id FROM public.get_public_published_results_scoped($1, $2, true) r", [tenantId, festivalId]);
    assert.deepEqual(new Set(pubRes.rows.map((r) => r.item_id)), new Set([item1, item2]));

    const partRes = await db.query("SELECT (r->>'item_id')::uuid AS item_id FROM public.get_public_participant_results_scoped($1, $2) r", [tenantId, festivalId]);
    assert.deepEqual(new Set(partRes.rows.map((r) => r.item_id)), new Set([item1, item2]));

    const cand = await db.query("SELECT public.get_public_candidate_profile('alice-101') AS doc");
    const candPublished = cand.rows[0].doc.published_results.map((r) => r.item_id);
    assert.deepEqual(candPublished, [item1], 'Alice only sees item 1 result, not item 3');
    assert.equal(cand.rows[0].doc.participated_items.length, 2, 'Participated items still listed cleanly');

    const unit = await db.query('SELECT public.get_public_unit_profile($1) AS doc', [orgA]);
    const aliceResults = unit.rows[0].doc.participants[0].registrations.flatMap((reg) => reg.results);
    assert.equal(aliceResults.length, 1, 'Unit Alpha profile only exposes item 1 result for Alice, not item 3');

    // Public AI views under anon
    const vwResults = await db.query('SELECT item_id FROM public.vw_public_results WHERE festival_id = $1', [festivalId]);
    assert.deepEqual(new Set(vwResults.rows.map((r) => r.item_id)), new Set([item1, item2]));

    const vwLive = await db.query('SELECT published_results_count FROM public.vw_public_live_status WHERE festival_id = $1', [festivalId]);
    assert.equal(Number(vwLive.rows[0].published_results_count), 2);

    const vwParticipants = await db.query('SELECT rank, points_awarded FROM public.vw_public_participants ORDER BY item_code ASC');
    assert.equal(vwParticipants.rows[0].points_awarded, 5);
    assert.equal(vwParticipants.rows[1].points_awarded, 5);
    assert.equal(vwParticipants.rows[2].rank, null, 'Item 3 rank masked in vw_public_participants');
    assert.equal(vwParticipants.rows[2].points_awarded, 0, 'Item 3 points masked in vw_public_participants');

    // Public generated_assets RLS allows posters for items 1 & 2 + manual media, blocks poster for item 3
    const publicAssets = await db.query('SELECT render_hash FROM public.generated_assets WHERE festival_id = $1 ORDER BY created_at ASC', [festivalId]);
    assert.deepEqual(publicAssets.rows.map((r) => r.render_hash), ['poster_item1', 'poster_item2', 'manual_media_1']);

    // Switch to authenticated Team Leader -> sees only item 1 (not item 3)
    await db.exec('RESET ROLE; SET ROLE authenticated');
    const leaderRes = await db.query('SELECT item_id FROM public.get_team_leader_published_results()');
    assert.deepEqual(leaderRes.rows.map((r) => r.item_id), [item1]);

    // Switch to authenticated Admin -> Poster Studio & Live Points Preview still see ALL 3 items!
    await db.query("SELECT set_config('test.user_id', $1, false)", [adminUser]);
    const adminAssets = await db.query('SELECT render_hash FROM public.generated_assets WHERE festival_id = $1 ORDER BY created_at ASC', [festivalId]);
    assert.equal(adminAssets.rows.length, 4, 'Admin Poster Studio retains access to all posters');

    const preview3 = await db.query("SELECT organisation_id, total_points FROM public.get_leaderboard_preview($1, $2, 'LIMITED', 3, true)", [tenantId, festivalId]);
    assert.equal(Number(preview3.rows.find((r) => r.organisation_id === orgA).total_points), 15, 'Admin preview can inspect 3 items (5 + 10 pts) while public stays capped at 2');

    // Changing item_limit dynamically (e.g. 1 -> only item1; ALL -> all 3 items)
    await db.exec('RESET ROLE');
    await db.query('UPDATE public.festival_leaderboard_settings SET item_limit = 1 WHERE festival_id = $1', [festivalId]);
    await db.exec('SET ROLE anon');
    const limit1 = await db.query('SELECT item_id FROM public.get_public_published_results($1, $2, true)', [tenantId, festivalId]);
    assert.deepEqual(limit1.rows.map((r) => r.item_id), [item1]);

    await db.exec('RESET ROLE');
    await db.query("UPDATE public.festival_leaderboard_settings SET ranking_mode = 'ALL', item_limit = NULL WHERE festival_id = $1", [festivalId]);
    await db.exec('SET ROLE anon');
    const allMode = await db.query('SELECT item_id FROM public.get_public_published_results($1, $2, true)', [tenantId, festivalId]);
    assert.deepEqual(new Set(allMode.rows.map((r) => r.item_id)), new Set([item1, item2, item3]));
  } finally {
    await db.close();
  }
});
