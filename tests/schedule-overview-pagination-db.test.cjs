const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const migration = fs.readFileSync('supabase/migrations/20261029100000_admin_schedule_overview_pagination.sql', 'utf8');

test('Schedule overview applies scope, filters, relevance ordering, pagination and date metadata in Postgres', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.user')::uuid $$;
      CREATE FUNCTION public.get_my_tenant_id() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.tenant')::uuid $$;
      CREATE FUNCTION public.is_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE TABLE public.festival_calendar(id uuid, tenant_id uuid);
      CREATE TABLE public.schedules(id uuid, tenant_id uuid, festival_id uuid, item_id uuid, venue_id uuid,
        start_time timestamptz, end_time timestamptz, status text, is_shuffle_locked boolean,
        is_public_visible boolean, expected_judge_count integer);
      CREATE TABLE public.items(id uuid, tenant_id uuid, festival_id uuid, item_code text,
        item_name_en text, item_name_ml text, category_codes text[]);
      CREATE TABLE public.venues(id uuid, tenant_id uuid, festival_id uuid, name text);
      CREATE TABLE public.registrations(id uuid, tenant_id uuid, festival_id uuid, item_id uuid,
        status text, is_verified boolean, code_letter text);
      CREATE TABLE public.judges(id uuid, tenant_id uuid);
      CREATE TABLE public.schedule_judge_assignments(schedule_id uuid, judge_id uuid, tenant_id uuid, status text);
      CREATE TABLE public.mark_entries(schedule_id uuid, judge_id uuid, registration_id uuid, is_final boolean, tenant_id uuid);
      CREATE TABLE public.results(schedule_id uuid, item_id uuid, tenant_id uuid, festival_id uuid,
        published boolean, result_status text, collection_method text);
      CREATE FUNCTION public.get_judge_management_status(p_tenant_id uuid)
        RETURNS TABLE(schedule_id uuid, marks_completed boolean) LANGUAGE sql STABLE SECURITY DEFINER AS $$
          WITH schedule_base AS (
            SELECT s.id,s.item_id,s.expected_judge_count,s.status FROM public.schedules s WHERE s.tenant_id=p_tenant_id
          ), eligible_registrations AS (
            SELECT sb.id AS sid,r.id AS registration_id FROM schedule_base sb
            JOIN public.registrations r ON r.item_id=sb.item_id AND r.status IS DISTINCT FROM 'rejected' AND r.code_letter IS NOT NULL
          ), eligible_regs AS (
            SELECT sb.id AS sid,count(er.registration_id)::bigint AS eligible_count FROM schedule_base sb
            LEFT JOIN eligible_registrations er ON er.sid=sb.id GROUP BY sb.id
          ), active_assignments AS (
            SELECT a.schedule_id,a.judge_id FROM public.schedule_judge_assignments a
            WHERE a.tenant_id=p_tenant_id AND a.status='active'
          ), judge_completion AS (
            SELECT aa.schedule_id,aa.judge_id,
              count(DISTINCT me.registration_id) FILTER (WHERE me.is_final IS TRUE)::bigint AS final_count
            FROM active_assignments aa LEFT JOIN public.mark_entries me ON me.schedule_id=aa.schedule_id
              AND me.judge_id=aa.judge_id AND me.registration_id IN (
                SELECT er.registration_id FROM eligible_registrations er WHERE er.sid=aa.schedule_id
              ) GROUP BY aa.schedule_id,aa.judge_id
          ), panel_counts AS (
            SELECT sb.id AS sid,count(DISTINCT aa.judge_id)::bigint AS assigned_count,
              count(DISTINCT gc.judge_id) FILTER (WHERE gc.final_count>=er.eligible_count AND er.eligible_count>0)::bigint AS completed_count
            FROM schedule_base sb JOIN eligible_regs er ON er.sid=sb.id
            LEFT JOIN active_assignments aa ON aa.schedule_id=sb.id
            LEFT JOIN judge_completion gc ON gc.schedule_id=aa.schedule_id AND gc.judge_id=aa.judge_id
            GROUP BY sb.id,er.eligible_count
          )
          SELECT sb.id,
            (sb.status IN ('completed','published') OR (
              er.eligible_count>0 AND pc.assigned_count=sb.expected_judge_count AND pc.completed_count>=sb.expected_judge_count
            ) OR EXISTS (
              SELECT 1 FROM public.results r WHERE r.item_id=sb.item_id
                AND (r.published IS TRUE OR r.result_status='published')
            ))
          FROM schedule_base sb JOIN eligible_regs er ON er.sid=sb.id JOIN panel_counts pc ON pc.sid=sb.id
        $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
      INSERT INTO public.festival_calendar VALUES
        ('${id(10)}','${id(1)}'),('${id(11)}','${id(2)}'),('${id(12)}','${id(1)}');
      INSERT INTO public.items VALUES
        ('${id(30)}','${id(1)}','${id(10)}','SP-01','Alpha Speech','ആൽഫ','{LP}'),
        ('${id(31)}','${id(1)}','${id(10)}','GN-01','General Song','ജനറൽ','{GN}'),
        ('${id(32)}','${id(1)}','${id(10)}','JR-01','Junior Story','ജൂനിയർ','{JUNIOR}'),
        ('${id(33)}','${id(1)}','${id(12)}','UP-01','Upper Item','UP item','{UP}'),
        ('${id(34)}','${id(1)}','${id(12)}','HS-01','High School Item','HS item','{HS}'),
        ('${id(35)}','${id(1)}','${id(12)}','HSS-01','Higher Secondary Item','HSS item','{HSS}'),
        ('${id(36)}','${id(1)}','${id(12)}','SR-01','Senior Item','SR item','{SR}'),
        ('${id(37)}','${id(1)}','${id(12)}','CA-01','Campus Item','CA item','{CA}');
      INSERT INTO public.venues VALUES
        ('${id(60)}','${id(1)}','${id(10)}','Stage A'),('${id(61)}','${id(1)}','${id(10)}','Stage B');
      INSERT INTO public.schedules VALUES
        ('${id(20)}','${id(1)}','${id(10)}','${id(30)}','${id(60)}',now()-interval '1 day',now()-interval '23 hours','scheduled',false,true,1),
        ('${id(21)}','${id(1)}','${id(10)}','${id(31)}','${id(61)}',now()+interval '1 hour',now()+interval '2 hours','ongoing',false,true,1),
        ('${id(22)}','${id(1)}','${id(10)}','${id(32)}','${id(60)}',now()+interval '1 day',now()+interval '1 day 1 hour','scheduled',false,true,1),
        ('${id(23)}','${id(1)}','${id(10)}','${id(30)}','${id(60)}',now()-interval '2 days',now()-interval '47 hours','completed',false,true,1),
        ('${id(24)}','${id(1)}','${id(10)}','${id(30)}','${id(61)}',now()-interval '3 days',now()-interval '71 hours','paused',false,true,1),
        ('${id(25)}','${id(1)}','${id(10)}','${id(31)}','${id(60)}','2020-01-01 19:00:00+00','2020-01-01 20:00:00+00','scheduled',false,true,1),
        ('${id(26)}','${id(1)}','${id(10)}','${id(31)}','${id(61)}',now()+interval '3 days',now()+interval '3 days 1 hour','scheduled',false,true,1),
        ('${id(27)}','${id(2)}','${id(11)}','${id(31)}','${id(61)}','2020-12-15 09:00:00+00','2020-12-15 10:00:00+00','scheduled',false,true,1),
        ('${id(28)}','${id(1)}','${id(12)}','${id(31)}','${id(61)}','2020-12-15 09:00:00+00','2020-12-15 10:00:00+00','scheduled',false,true,1),
        ('${id(50)}','${id(1)}','${id(12)}','${id(33)}','${id(60)}',now()+interval '4 days',now()+interval '4 days 1 hour','scheduled',false,true,1),
        ('${id(51)}','${id(1)}','${id(12)}','${id(34)}','${id(60)}',now()+interval '5 days',now()+interval '5 days 1 hour','scheduled',false,true,1),
        ('${id(52)}','${id(1)}','${id(12)}','${id(35)}','${id(60)}',now()+interval '6 days',now()+interval '6 days 1 hour','scheduled',false,true,1),
        ('${id(53)}','${id(1)}','${id(12)}','${id(36)}','${id(60)}',now()+interval '7 days',now()+interval '7 days 1 hour','scheduled',false,true,1),
        ('${id(54)}','${id(1)}','${id(12)}','${id(37)}','${id(60)}',now()+interval '8 days',now()+interval '8 days 1 hour','scheduled',false,true,1);
      INSERT INTO public.registrations VALUES
        ('${id(40)}','${id(1)}','${id(10)}','${id(30)}','approved',true,'A'),
        ('${id(41)}','${id(1)}','${id(10)}','${id(30)}','pending',false,null),
        ('${id(42)}','${id(1)}','${id(10)}','${id(30)}','rejected',true,'B'),
        ('${id(43)}','${id(1)}','${id(10)}','${id(31)}','approved',true,'A'),
        ('${id(44)}','${id(1)}','${id(10)}','${id(32)}','approved',true,null),
        ('${id(45)}','${id(1)}','${id(10)}','${id(32)}','approved',true,'B');
      INSERT INTO public.judges VALUES ('${id(80)}','${id(1)}');
      INSERT INTO public.schedule_judge_assignments VALUES ('${id(22)}','${id(80)}','${id(1)}','active');
      INSERT INTO public.mark_entries VALUES ('${id(22)}','${id(80)}','${id(45)}',true,'${id(1)}');
      INSERT INTO public.results VALUES
        ('${id(26)}','${id(31)}','${id(1)}','${id(10)}',true,'published','manual');
      ALTER TABLE public.festival_calendar ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.judges ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.schedule_judge_assignments ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.mark_entries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_rows ON public.festival_calendar TO authenticated USING (tenant_id=current_setting('test.tenant')::uuid);
      CREATE POLICY tenant_rows ON public.schedules TO authenticated USING (tenant_id=current_setting('test.tenant')::uuid);
      CREATE POLICY tenant_rows ON public.items TO authenticated USING (tenant_id=current_setting('test.tenant')::uuid);
      CREATE POLICY tenant_rows ON public.venues TO authenticated USING (tenant_id=current_setting('test.tenant')::uuid);
      CREATE POLICY tenant_rows ON public.registrations TO authenticated USING (tenant_id=current_setting('test.tenant')::uuid);
      CREATE POLICY tenant_rows ON public.judges TO authenticated USING (tenant_id=current_setting('test.tenant')::uuid);
      CREATE POLICY tenant_rows ON public.schedule_judge_assignments TO authenticated USING (tenant_id=current_setting('test.tenant')::uuid);
      CREATE POLICY tenant_rows ON public.mark_entries TO authenticated USING (tenant_id=current_setting('test.tenant')::uuid);
      CREATE POLICY tenant_rows ON public.results TO authenticated USING (tenant_id=current_setting('test.tenant')::uuid);
    `);
    await db.exec(migration);
    await db.exec(`
      INSERT INTO public.schedules
      SELECT gen_random_uuid(),'${id(1)}','${id(12)}',NULL,NULL,now()+make_interval(secs=>n),now()+make_interval(secs=>n+1),'scheduled',false,true,1
      FROM generate_series(1,104) n;
      SET ROLE authenticated;
      SELECT set_config('test.user','${id(99)}',false),set_config('test.tenant','${id(1)}',false);
    `);

    const call = async (festivalId, overrides = {}) => {
      const params = {
        search: null, item: null, category: null, venue: null, date: null,
        status: null, page: 1, size: 25, timezone: 'Asia/Kolkata', asOf: null, ...overrides,
      };
      const { rows } = await db.query(`SELECT public.admin_schedule_overview_page(
        '${id(1)}','${festivalId}',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS page`,
      [params.search, params.item ? id(params.item) : null, params.category,
        params.venue ? id(params.venue) : null, params.date, params.status,
        params.page, params.size, params.timezone, params.asOf]);
      return rows[0].page;
    };

    const first = await call(id(10), { size: 2 });
    assert.equal(first.total_count, 7);
    assert.equal(first.festival_total_count, 7);
    assert.equal(first.rows.length, 2);
    assert.deepEqual(first.rows.map((row) => row.id), [id(25), id(20)]);
    const second = await call(id(10), { size: 2, page: 2 });
    assert.deepEqual(second.rows.map((row) => row.id), [id(21), id(22)]);

    assert.equal((await call(id(10), { search: 'alpha' })).total_count, 3);
    assert.equal((await call(id(10), { search: 'ആൽഫ' })).total_count, 3);
    assert.deepEqual((await call(id(10), { item: 31 })).rows.map((row) => row.id), [id(25), id(21), id(26)]);
    assert.equal((await call(id(10), { category: 'GENERAL' })).total_count, 3);
    assert.equal((await call(id(10), { category: 'GN' })).total_count, 3);
    assert.equal((await call(id(10), { category: 'JUNIOR' })).total_count, 1);
    assert.equal((await call(id(10), { venue: 60 })).total_count, 4);
    assert.equal((await call(id(10), { search: 'LP' })).total_count, 3);
    assert.deepEqual((await call(id(10), { category: 'GN', venue: 60, date: '2020-01-02' })).rows.map((row) => row.id), [id(25)], 'combined filters intersect before paging');
    assert.deepEqual((await call(id(10), { date: '2020-01-02' })).rows.map((row) => row.id), [id(25)]);
    assert.equal((await call(id(10), { date: '2020-01-01' })).total_count, 0);
    for (const [category, festivalId, expected] of [
      ['LP',id(10),3],['JUNIOR',id(10),1],['JR',id(10),1],['UP',id(12),1],['HS',id(12),1],
      ['HSS',id(12),1],['SENIOR',id(12),1],['SR',id(12),1],['CAMPUS',id(12),1],['CA',id(12),1],
    ]) {
      assert.equal((await call(festivalId, { category })).total_count, expected, `${category} category alias`);
    }

    for (const [status, expected] of [
      ['scheduled', [id(25),id(20),id(22),id(26)]],
      ['ongoing', [id(21)]],
      ['completed', [id(23)]],
      ['checkin_pending', [id(20),id(24),id(23)]],
      ['checkin_done', [id(25),id(21),id(22),id(26)]],
      ['codes_pending', [id(22)]],
      ['codes_done', [id(25),id(20),id(21),id(26),id(24),id(23)]],
      ['marks_pending', [id(20),id(24)]],
      ['marks_done', [id(25),id(21),id(22),id(26),id(23)]],
      ['published', [id(26)]],
    ]) {
      const result = await call(id(10), { status, size: 100 });
      assert.equal(result.total_count, expected.length, `${status} total_count`);
      assert.deepEqual(result.rows.map((row) => row.id), expected, `${status} matching rows`);
    }
    assert.equal((await call(id(10), { status: 'completed', size: 100 })).rows.every((row) => row.status === 'completed'), true,
      'explicit completed filter excludes relevance rows');
    const pageRows = (await call(id(10), { size: 100 })).rows;
    const canonicalMarks = await db.query(`SELECT g.schedule_id,g.marks_completed FROM public.get_judge_management_status('${id(1)}') g
      JOIN public.schedules s ON s.id=g.schedule_id WHERE s.festival_id='${id(10)}'`);
    const canonicalById = new Map(canonicalMarks.rows.map((row) => [row.schedule_id, row.marks_completed]));
    assert.deepEqual(pageRows.map((row) => [row.id,row.marks_completed]).sort(([left],[right]) => left.localeCompare(right)),
      [...canonicalById.entries()].sort(([left],[right]) => left.localeCompare(right)),
      'page-scoped inline marks completion retains canonical helper semantics');
    assert.equal(pageRows.find((row) => row.id === id(22)).submitted_judges, 1,
      'the judge completion aggregate remains correct for a finalized eligible mark');

    const oversized = await call(id(12), { page: 0, size: 1000 });
    assert.equal(oversized.total_count, 110);
    assert.equal(oversized.rows.length, 100, 'page size is capped at 100 and page at 1');
    const availableDates = await db.query(`SELECT public.admin_schedule_available_dates('${id(1)}','${id(10)}','Asia/Kolkata') AS dates`);
    const availableDayStrings = availableDates.rows[0].dates.map((date) => new Date(date).toISOString().slice(0,10));
    assert.ok(availableDayStrings.includes('2020-01-02'), `festival-local date uses Asia/Kolkata rather than UTC: ${JSON.stringify(availableDates.rows[0].dates)}`);
    assert.equal(availableDayStrings.includes('2020-12-15'), false, 'available-date metadata excludes another festival');
    await assert.rejects(call(id(11)), /Festival unavailable/);
    await assert.rejects(call(id(10), { timezone: 'Not/A_Timezone' }), /Invalid schedule timezone/);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(call(id(10)), /permission denied/);
  } finally {
    await db.close();
  }
});
