const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const migration = fs.readFileSync('supabase/migrations/20261031024455_admin_program_reads.sql', 'utf8');

test('admin program reads scope tenant data, filter before paging, and load only selected program details', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text, tenant_id uuid, is_superadmin boolean);
      CREATE TABLE public.festival_calendar(id uuid PRIMARY KEY, tenant_id uuid, general_category_enabled boolean, is_active boolean);
      CREATE TABLE public.organisations(id uuid PRIMARY KEY, tenant_id uuid, name text, org_type text);
      CREATE FUNCTION public.get_visible_organisations(p_tenant_id uuid)
        RETURNS TABLE(id uuid, tenant_id uuid) LANGUAGE sql STABLE AS $$
          SELECT o.id,o.tenant_id FROM public.organisations o WHERE o.tenant_id=p_tenant_id
        $$;
      CREATE TABLE public.items(id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, item_code text,
        item_name_en text, item_name_ml text, item_type text, participation_type text, category_codes text[],
        gender text, max_participants_per_team integer, is_active boolean, group_min_members integer,
        group_max_members integer, white_dress_required boolean, regional_dialect_blocked boolean);
      CREATE TABLE public.program_intake_statuses(tenant_id uuid, festival_id uuid, item_id uuid,
        category_code text, entry_kind text, is_complete boolean);
      CREATE TABLE public.participants(id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, organisation_id uuid,
        name text, chest_number text, category_code text, gender text, status text,
        is_post_hs_religious boolean, plagiarism_ban_until date);
      CREATE TABLE public.registrations(id uuid PRIMARY KEY, tenant_id uuid, festival_id uuid, item_id uuid,
        participant_id uuid, organisation_id uuid, entry_kind text, status text, is_verified boolean, code_letter text);
      INSERT INTO public.profiles VALUES ('${id(90)}','admin','${id(1)}',false),('${id(91)}','admin','${id(2)}',false);
      INSERT INTO public.festival_calendar VALUES ('${id(10)}','${id(1)}',false,true),('${id(11)}','${id(2)}',true,true);
      INSERT INTO public.organisations VALUES ('${id(100)}','${id(1)}','Visible team','unit'),('${id(101)}','${id(2)}','Other tenant','unit');
      INSERT INTO public.items
      SELECT ('00000000-0000-0000-0000-'||lpad((n+199)::text,12,'0'))::uuid,'${id(1)}','${id(10)}',
        'ITEM-'||lpad(n::text,3,'0'),'Program '||lpad(n::text,3,'0'),NULL,
        CASE WHEN n=1 THEN 'stage' ELSE 'offstage' END,'individual',
        CASE WHEN n=2 THEN ARRAY['JUNIOR']::text[] ELSE ARRAY['LP']::text[] END,
        'both',1,true,NULL,NULL,n=1,false
      FROM generate_series(1,25) AS n;
      INSERT INTO public.items VALUES ('${id(230)}','${id(1)}','${id(10)}','GROUP-01','Group program',NULL,
        'offstage','group',ARRAY['GN'],'both',NULL,true,2,4,false,false);
      INSERT INTO public.items VALUES ('${id(231)}','${id(2)}','${id(11)}','OTHER-01','Other tenant item',NULL,
        'offstage','individual',ARRAY['LP'],'both',1,true,NULL,NULL,false,false);
      INSERT INTO public.participants VALUES
        ('${id(300)}','${id(1)}','${id(10)}','${id(100)}','Assigned null status','100','LP','boys','approved',false,NULL),
        ('${id(301)}','${id(1)}','${id(10)}','${id(100)}','Assigned rejected','101','LP','boys','rejected',false,NULL),
        ('${id(302)}','${id(1)}','${id(10)}','${id(100)}','Assigned second','102','LP','boys','approved',false,NULL),
        ('${id(303)}','${id(1)}','${id(10)}','${id(100)}','Eligible unassigned','103','LP','boys','approved',false,NULL),
        ('${id(304)}','${id(2)}','${id(11)}','${id(101)}','Other tenant person','104','LP','boys','approved',false,NULL);
      INSERT INTO public.registrations VALUES
        ('${id(400)}','${id(1)}','${id(10)}','${id(200)}','${id(300)}','${id(100)}','participant',NULL,false,NULL),
        ('${id(401)}','${id(1)}','${id(10)}','${id(200)}','${id(301)}','${id(100)}','participant','rejected',false,NULL),
        ('${id(402)}','${id(1)}','${id(10)}','${id(200)}','${id(302)}','${id(100)}','participant','approved',false,NULL),
        ('${id(404)}','${id(2)}','${id(10)}','${id(200)}','${id(300)}','${id(100)}','participant','approved',false,NULL),
        ('${id(403)}','${id(2)}','${id(11)}','${id(231)}','${id(304)}','${id(101)}','participant','approved',false,NULL);
      INSERT INTO public.program_intake_statuses VALUES
        ('${id(1)}','${id(10)}','${id(200)}','LP','participant',true),
        ('${id(1)}','${id(10)}','${id(230)}','GN','participant',true);
    `);
    await db.exec(migration);
    await db.exec(`SET ROLE authenticated; SELECT set_config('test.user','${id(90)}',false);`);

    const readPage = async ({ section = 'individual', search = '', type = 'All types', stage = 'All stages', status = 'All statuses', category = 'All categories', page = 1 } = {}) => {
      const { rows } = await db.query(`SELECT public.admin_program_cards_page($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result`,
        [id(1), id(10), section, search, type, stage, status, category, page]);
      return rows[0].result;
    };
    const first = await readPage();
    assert.equal(first.total, 25);
    assert.equal(first.cards.length, 20);
    assert.equal(first.cards[0].item.item_code, 'ITEM-001');
    assert.equal(first.cards[0].assigned_count, 2, 'active and null-status assignments count; rejected does not');
    assert.equal(first.cards[0].over_limit_teams, 1, 'per-team cap summary preserves null-status assignments');
    assert.equal(first.cards[0].is_complete, true);

    const second = await readPage({ page: 2 });
    assert.equal(second.cards.length, 5);
    assert.equal(second.cards[0].item.item_code, 'ITEM-021');
    assert.equal((await readPage({ search: 'Program 025' })).cards[0].item.item_code, 'ITEM-025');
    assert.equal((await readPage({ category: 'JR' })).cards[0].item.item_code, 'ITEM-002', 'category aliases remain searchable');
    assert.equal((await readPage({ stage: 'On Stage' })).total, 1);
    assert.equal((await readPage({ status: 'Complete' })).total, 1, 'status filtering is applied before paging');

    const group = await readPage({ section: 'group' });
    assert.equal(group.total, 0, 'general category stays hidden when disabled');
    await db.exec(`RESET ROLE; UPDATE public.festival_calendar SET general_category_enabled=true WHERE id='${id(10)}'; SET ROLE authenticated;`);
    const enabledGroup = await readPage({ section: 'group' });
    assert.equal(enabledGroup.total, 1);
    assert.equal(enabledGroup.cards[0].is_complete, true, 'legacy participant completion fallback is preserved');

    const { rows: detailRows } = await db.query(`SELECT public.admin_program_detail($1,$2,$3,'LP',true) AS result`, [id(1), id(10), id(200)]);
    const detail = detailRows[0].result;
    assert.deepEqual(detail.participants.map(person => person.id).sort(), [id(300),id(301),id(302),id(303)].sort());
    assert.equal(detail.registrations.length, 3, 'detail includes only registrations for the selected item and visible tenant');
    assert.ok(!detail.participants.some(person => person.id === id(304)));

    await assert.rejects(db.query(`SELECT public.admin_program_cards_page($1,$2,'individual','','All types','All stages','All statuses','All categories',1)`, [id(2),id(11)]), /Festival unavailable/);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query(`SELECT public.admin_program_cards_page($1,$2,'individual','','All types','All stages','All statuses','All categories',1)`, [id(1),id(10)]), /permission denied/);
  } finally {
    await db.close();
  }
});
