/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261029011428_admin_participant_filtered_list.sql'), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('admin participant filtering runs under caller RLS and filters before paging', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE participants(id uuid PRIMARY KEY, name text NOT NULL, chest_number text, category_code text, status text, gender text, created_at timestamptz, tenant_id uuid);
      CREATE TABLE registrations(id uuid PRIMARY KEY, participant_id uuid, item_id uuid, festival_id uuid, status text, tenant_id uuid);
      CREATE TABLE group_members(id uuid PRIMARY KEY, registration_id uuid REFERENCES registrations(id), participant_id uuid);
      ALTER TABLE participants ENABLE ROW LEVEL SECURITY; ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
      CREATE POLICY participant_visible ON participants TO authenticated USING (tenant_id = current_setting('test.tenant')::uuid);
      CREATE POLICY registration_visible ON registrations TO authenticated USING (tenant_id = current_setting('test.tenant')::uuid);
      GRANT SELECT ON participants, registrations TO authenticated;
      ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
      CREATE POLICY broad_membership_read ON group_members TO authenticated USING (true);
      GRANT SELECT ON group_members TO authenticated;
      INSERT INTO participants SELECT ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'Person ' || n, 'C' || n,
        CASE WHEN n % 2 = 0 THEN 'JR' ELSE 'SR' END, CASE WHEN n % 3 = 0 THEN null ELSE 'approved' END,
        CASE WHEN n % 2 = 0 THEN 'boys' ELSE 'girls' END, '2026-01-01'::timestamptz, '${id(1)}'
        FROM generate_series(1,120) n;
      INSERT INTO participants VALUES ('${id(300)}','Hidden','hidden','JR','pending','boys',now(),'${id(2)}');
      INSERT INTO registrations VALUES
        ('${id(501)}','${id(2)}','${id(700)}','${id(800)}',null,'${id(1)}'),
        ('${id(502)}','${id(4)}','${id(700)}','${id(800)}','rejected','${id(1)}'),
        ('${id(503)}','${id(6)}','${id(700)}','${id(800)}','pending','${id(2)}'),
        ('${id(504)}','${id(8)}','${id(700)}','${id(801)}','pending','${id(1)}'),
        ('${id(505)}','${id(300)}','${id(700)}','${id(800)}','pending','${id(2)}'),
        ('${id(506)}',null,'${id(700)}','${id(800)}','pending','${id(1)}');
      INSERT INTO group_members VALUES
        ('${id(901)}','${id(501)}','${id(2)}'),
        ('${id(902)}','${id(503)}','${id(2)}'),
        ('${id(903)}','${id(504)}','${id(2)}');
    `);
    await db.exec(migration);
    const call = (params, suffix = '') => db.query(`SELECT id, name FROM public.admin_filtered_participants($1,$2,$3,$4,$5,$6,$7) ${suffix}`, params);
    const args = ['', null, null, null, null, null, null];
    await t.test('anonymous cannot invoke; authenticated sees only permitted participants', async () => {
      await db.exec('SET ROLE anon');
      await assert.rejects(call(args), /permission denied/);
      await db.exec('RESET ROLE; SET ROLE authenticated');
      await db.query("SELECT set_config('test.tenant', $1, false)", [id(1)]);
      assert.equal((await call(args)).rows.length, 120);
    });
    await t.test('search, category, status and gender combine before stable pagination', async () => {
      const filters = ['Person 1', 'JR', 'pending', 'BOYS', null, null, null];
      const all = (await call(filters, 'ORDER BY created_at DESC NULLS FIRST, id DESC')).rows;
      const page1 = (await call(filters, 'ORDER BY created_at DESC NULLS FIRST, id DESC LIMIT 2 OFFSET 0')).rows;
      const page2 = (await call(filters, 'ORDER BY created_at DESC NULLS FIRST, id DESC LIMIT 2 OFFSET 2')).rows;
      assert.ok(all.length > 2); assert.deepEqual([...page1, ...page2], all.slice(0,4));
      assert.ok(all.every(r => r.name.includes('1')));
      assert.equal((await call(['C120', null, null, null, null, null, null])).rows[0].id, id(120));
    });
    await t.test('competition honors festival, category, null and rejected status and registration RLS', async () => {
      const rows = (await call(['', null, null, null, id(800), id(700), 'jr'])).rows;
      assert.deepEqual(rows.map(r => r.id), [id(2)]);
      assert.equal((await call(['', null, null, null, id(800), id(700), 'SR'])).rows.length, 0);
    });
    await t.test('membership discovery joins visible registrations even when membership RLS is broad', async () => {
      assert.equal((await db.query('SELECT id FROM group_members')).rows.length, 3);
      const result = await db.query('SELECT gm.id FROM group_members gm INNER JOIN registrations r ON r.id=gm.registration_id WHERE gm.participant_id=$1 AND r.festival_id=$2', [id(2), id(800)]);
      assert.deepEqual(result.rows.map(row => row.id), [id(901)]);
    });
    await t.test('full filtered result is larger than a page and supports all matching ids', async () => {
      const filters = ['', 'JR', null, null, null, null, null];
      const all = (await call(filters, 'ORDER BY created_at DESC NULLS FIRST, id DESC')).rows;
      const first = (await call(filters, 'ORDER BY created_at DESC NULLS FIRST, id DESC LIMIT 50')).rows;
      const second = (await call(filters, 'ORDER BY created_at DESC NULLS FIRST, id DESC LIMIT 50 OFFSET 50')).rows;
      assert.equal(all.length, 60); assert.deepEqual([...first, ...second], all);
    });
  } finally { await db.close(); }
});
