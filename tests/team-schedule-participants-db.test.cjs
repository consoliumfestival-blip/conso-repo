/* global __dirname */
// Disposable PostgreSQL WASM database; no remote connections or environment credentials.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [root, path.join(root, '.expo/verification')] }));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('schedule participant SQL permissions, completion and isolation contracts', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE organisations(id uuid PRIMARY KEY,tenant_id uuid,name text);
      CREATE TABLE participants(id uuid PRIMARY KEY,name text,gender text,category_code text,chest_number text,status text,festival_id uuid,organisation_id uuid,tenant_id uuid);
      CREATE TABLE items(id uuid PRIMARY KEY,festival_id uuid,tenant_id uuid,item_code text,item_name_en text,item_name_ml text,category_codes text[],participation_type text);
      CREATE TABLE registrations(id uuid PRIMARY KEY,participant_id uuid,item_id uuid,organisation_id uuid,tenant_id uuid,festival_id uuid,entry_kind text,status text,is_verified boolean);
      CREATE TABLE group_members(registration_id uuid,participant_id uuid);
      CREATE TABLE schedules(id uuid PRIMARY KEY,item_id uuid,tenant_id uuid,festival_id uuid,is_shuffle_locked boolean,status text);
      CREATE TABLE fixture_assignments(user_id uuid,parent_tenant_id uuid,festival_id uuid,organisation_id uuid,active boolean);
      CREATE FUNCTION public.get_team_leader_context() RETURNS TABLE(parent_tenant_id uuid,festival_id uuid,organisation_id uuid)
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT parent_tenant_id,festival_id,organisation_id FROM public.fixture_assignments WHERE user_id=auth.uid() AND active $$;
      CREATE FUNCTION public.get_visible_organisations(p_tenant uuid) RETURNS TABLE(id uuid,tenant_id uuid)
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT id,tenant_id FROM public.organisations WHERE tenant_id IN (p_tenant,'${id(11)}','${id(12)}') $$;
      INSERT INTO organisations VALUES ('${id(21)}','${id(11)}','Own team'),('${id(22)}','${id(12)}','Other team');
      INSERT INTO fixture_assignments VALUES ('${id(1)}','${id(10)}','${id(30)}','${id(21)}',true);
      INSERT INTO items VALUES ('${id(40)}','${id(30)}','${id(10)}','I1','Speech',null,ARRAY['JR'],'individual'),('${id(41)}','${id(30)}','${id(10)}','G1','Group',null,ARRAY['GN'],'group');
      INSERT INTO schedules VALUES ('${id(50)}','${id(40)}','${id(10)}','${id(30)}',false,'completed'),('${id(51)}','${id(41)}','${id(10)}','${id(30)}',false,'scheduled'),('${id(52)}','${id(40)}','${id(99)}','${id(30)}',false,'scheduled'),('${id(53)}','${id(40)}','${id(10)}','${id(99)}',false,'scheduled');
      INSERT INTO participants VALUES ('${id(60)}','Own A','male','JR','101','approved','${id(30)}','${id(21)}','${id(11)}'),('${id(61)}','Own B','male','JR','102','approved','${id(30)}','${id(21)}','${id(11)}'),('${id(62)}','Other A','male','JR','201','approved','${id(30)}','${id(22)}','${id(12)}');
      INSERT INTO registrations VALUES ('${id(70)}','${id(60)}','${id(40)}','${id(21)}','${id(11)}','${id(30)}','participant','pending',true),('${id(71)}','${id(62)}','${id(40)}','${id(22)}','${id(12)}','${id(30)}','participant','pending',false),('${id(72)}','${id(61)}','${id(40)}','${id(21)}','${id(11)}','${id(30)}','participant','rejected',false),('${id(73)}',null,'${id(41)}','${id(21)}','${id(11)}','${id(30)}','general_team','pending',true);
      INSERT INTO group_members VALUES ('${id(73)}','${id(60)}'),('${id(73)}','${id(61)}');
    `);
    await db.exec(read('supabase/migrations/20261024130233_team_leader_participant_export_rows.sql'));
    const migration = read('supabase/migrations/20261025174415_team_leader_schedule_participant_details.sql');
    await db.exec(migration);
    await db.exec(migration); // replay must not alter existing contracts
    async function rpc(schedule = 50, user = 1, role = 'authenticated', schema = 'public') {
      await db.exec(`SET ROLE ${role}`);
      try {
        await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user === null ? '' : id(user)]);
        return (await db.query(`SELECT ${schema}.get_team_leader_schedule_participants($1::uuid) AS result`, [id(schedule)])).rows[0].result;
      } finally { await db.exec('RESET ROLE'); }
    }
    await t.test('anonymous execution is denied', async () => { await assert.rejects(rpc(50, null, 'anon'), /permission denied/); });
    await t.test('authenticated role without identity is denied, including private helper', async () => {
      await assert.rejects(rpc(50, null), /Authentication/);
      await assert.rejects(rpc(50, null, 'authenticated', 'private'), /Authentication/);
    });
    await t.test('missing or revoked assignment is denied', async () => {
      await assert.rejects(rpc(50, 2), /active Team Leader/);
      await db.exec('UPDATE fixture_assignments SET active=false');
      await assert.rejects(rpc(), /active Team Leader/);
      await db.exec('UPDATE fixture_assignments SET active=true');
    });
    await t.test('cross-tenant, cross-festival and nonexistent schedules are denied', async () => {
      for (const schedule of [52, 53, 999]) await assert.rejects(rpc(schedule), /unavailable/);
    });
    await t.test('completed lifecycle and own-team verification cannot bypass other teams pending check-in', async () => {
      const data = await rpc();
      assert.equal(data.checkin_complete, false);
      assert.deepEqual(data.participants.map(r => r.participant_name), ['Own A', 'Own B']);
      assert.ok(data.participants.every(r => r.organisation_id === id(21) && r.item_id === id(40)));
      assert.equal(data.participants.find(r => r.participant_name === 'Own B').registration_status, 'rejected');
      assert.deepEqual(Object.keys(data).sort(), ['checkin_complete', 'item_id', 'participants', 'schedule_id']);
    });
    await t.test('all active entries verified completes check-in; rejected entries do not block it', async () => {
      await db.exec(`UPDATE registrations SET is_verified=true WHERE id='${id(71)}'`);
      assert.equal((await rpc()).checkin_complete, true);
    });
    await t.test('newly unverified entry revokes PDF eligibility on the next read', async () => {
      await db.exec(`UPDATE registrations SET is_verified=null WHERE id='${id(71)}'`);
      assert.equal((await rpc()).checkin_complete, false);
    });
    await t.test('shuffle lock uses existing Admin completion override', async () => {
      await db.exec(`UPDATE schedules SET is_shuffle_locked=true WHERE id='${id(50)}'`);
      assert.equal((await rpc()).checkin_complete, true);
      await db.exec(`UPDATE schedules SET is_shuffle_locked=false WHERE id='${id(50)}'`);
    });
    await t.test('all group members inherit entry verification and retain individual chest numbers', async () => {
      const data = await rpc(51);
      assert.equal(data.checkin_complete, true);
      assert.deepEqual(data.participants.map(r => r.chest_number), ['101', '102']);
      assert.ok(data.participants.every(r => r.entry_kind === 'general_team' && r.is_verified));
    });
    await t.test('cancelled assignments remain visible as cancelled', async () => {
      await db.exec(`UPDATE registrations SET status='cancelled' WHERE id='${id(72)}'`);
      assert.equal((await rpc()).participants.find(r => r.participant_id === id(61)).registration_status, 'cancelled');
    });
    await t.test('zero active entries is pending unless shuffle locked', async () => {
      await db.exec(`UPDATE registrations SET status='rejected' WHERE item_id='${id(40)}'`);
      assert.equal((await rpc()).checkin_complete, false);
    });
    await t.test('empty own-team roster is an empty list rather than another teams rows', async () => {
      await db.exec(`DELETE FROM group_members; DELETE FROM registrations WHERE item_id='${id(41)}'`);
      const data = await rpc(51);
      assert.deepEqual(data.participants, []);
      assert.equal(data.checkin_complete, false);
    });
    await t.test('direct table reads stay denied and read-only transaction succeeds without data changes', async () => {
      const before = await db.query('SELECT jsonb_agg(to_jsonb(r)) AS snapshot FROM registrations r');
      await db.exec('SET ROLE authenticated');
      await assert.rejects(db.query('SELECT * FROM registrations'), /permission denied/);
      await db.exec('RESET ROLE; BEGIN READ ONLY');
      await rpc();
      await db.exec('COMMIT');
      assert.deepEqual(await db.query('SELECT jsonb_agg(to_jsonb(r)) AS snapshot FROM registrations r'), before);
    });
    await t.test('invisible assigned team is rejected by existing export authorization', async () => {
      await db.exec(`UPDATE organisations SET tenant_id='${id(99)}' WHERE id='${id(21)}'`);
      await assert.rejects(rpc(), /outside the festival tenant scope/);
    });
  } finally { await db.close(); }
});
