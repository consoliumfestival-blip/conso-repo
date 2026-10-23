const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('safe group deletion preserves history, participants and tenant boundaries', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA group_entry_private;
      CREATE TABLE group_entry_private.member_edit_authorizations(transaction_id bigint,registration_id uuid,actor_id uuid);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE TABLE profiles(id uuid PRIMARY KEY,tenant_id uuid,role text,is_superadmin boolean);
      CREATE TABLE festival_calendar(id uuid PRIMARY KEY,tenant_id uuid);
      CREATE TABLE organisations(id uuid PRIMARY KEY,tenant_id uuid);
      CREATE TABLE participants(id uuid PRIMARY KEY,chest_number text);
      CREATE TABLE registrations(id uuid PRIMARY KEY,tenant_id uuid,festival_id uuid,item_id uuid,
        organisation_id uuid,participant_id uuid,entry_kind text,is_group_registration boolean,
        is_verified boolean DEFAULT false,code_letter_fixed boolean DEFAULT false,code_letter text,group_leader_participant_id uuid);
      CREATE TABLE group_members(id uuid PRIMARY KEY,registration_id uuid REFERENCES registrations,
        participant_id uuid REFERENCES participants);
      CREATE TABLE mark_entries(registration_id uuid REFERENCES registrations);
      CREATE TABLE results(registration_id uuid REFERENCES registrations);
      CREATE TABLE schedules(id uuid PRIMARY KEY,item_id uuid,festival_id uuid);
      CREATE TABLE attendance(participant_id uuid REFERENCES participants,schedule_id uuid REFERENCES schedules);
      CREATE TABLE certificates(participant_id uuid REFERENCES participants,item_id uuid);
      CREATE TABLE audit_logs(tenant_id uuid,user_id uuid,action text,table_name text,record_id uuid,
        old_value jsonb,new_value jsonb);
      CREATE FUNCTION get_visible_organisations(p_tenant_id uuid) RETURNS TABLE(id uuid)
        LANGUAGE sql AS $$SELECT id FROM public.organisations WHERE tenant_id=p_tenant_id$$;
      INSERT INTO profiles VALUES('${id(1)}','${id(10)}','admin',false),
        ('${id(2)}','${id(20)}','admin',false),('${id(3)}','${id(10)}','team_leader',false);
      INSERT INTO festival_calendar VALUES('${id(11)}','${id(10)}');
      INSERT INTO organisations VALUES('${id(12)}','${id(10)}');
      INSERT INTO participants VALUES('${id(31)}','101'),('${id(32)}','102');
      INSERT INTO schedules VALUES('${id(40)}','${id(13)}','${id(11)}');
    `);
    const source = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20261022122300_source_structure_sync.sql'), 'utf8');
    for (const name of ['guard_member', 'ensure_leader_membership']) {
      const definition = source.match(new RegExp(`CREATE OR REPLACE FUNCTION group_entry_private\\.${name}\\([\\s\\S]*?END \\$function\\$;`));
      assert.ok(definition, `actual ${name} trigger function is available`);
      await db.exec(definition[0]);
    }
    await db.exec(`CREATE TRIGGER roster_guard BEFORE DELETE ON group_members
      FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_member();
      CREATE CONSTRAINT TRIGGER roster_leader AFTER DELETE ON group_members DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION group_entry_private.ensure_leader_membership();`);
    await db.exec(fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20261023110000_safe_delete_group_entry.sql'), 'utf8'));
    const actor = async n => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']);
    const seed = async () => db.exec(`INSERT INTO registrations VALUES('${id(50)}','${id(10)}','${id(11)}',
      '${id(13)}','${id(12)}',NULL,'general_team',true,false,false,NULL,'${id(31)}');
      INSERT INTO group_members VALUES('${id(51)}','${id(50)}','${id(31)}'),('${id(52)}','${id(50)}','${id(32)}');`);
    const remove = async () => (await db.query('SELECT safe_delete_group_entry($1) AS result', [id(50)])).rows[0].result;
    const count = async table => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
    await seed();

    for (const [label, actorId] of [['anonymous', null], ['team leader', 3], ['other tenant admin', 2]]) {
      await t.test(`${label} cannot delete`, async () => {
        await actor(actorId);
        await assert.rejects(remove, e => e.code === '42501');
        assert.equal(await count('group_members'), 2);
      });
    }
    await actor(1);
    for (const [label, setup, cleanup] of [
      ['marks', `INSERT INTO mark_entries VALUES('${id(50)}')`, 'DELETE FROM mark_entries'],
      ['results', `INSERT INTO results VALUES('${id(50)}')`, 'DELETE FROM results'],
      ['check-in', 'UPDATE registrations SET is_verified=true', 'UPDATE registrations SET is_verified=false'],
      ['fixed letter', 'UPDATE registrations SET code_letter_fixed=true', 'UPDATE registrations SET code_letter_fixed=false'],
      ['code letter', "UPDATE registrations SET code_letter='A'", 'UPDATE registrations SET code_letter=NULL'],
      ['attendance', `INSERT INTO attendance VALUES('${id(31)}','${id(40)}')`, 'DELETE FROM attendance'],
      ['certificate', `INSERT INTO certificates VALUES('${id(31)}','${id(13)}')`, 'DELETE FROM certificates'],
    ]) {
      await t.test(`${label} blocks deletion and retains all members`, async () => {
        await db.exec(setup);
        assert.equal((await remove()).status, 'blocked');
        assert.equal(await count('group_members'), 2);
        assert.equal(await count('registrations'), 1);
        await db.exec(cleanup);
      });
    }
    await t.test('unknown dependency rolls back member deletion too', async () => {
      await db.exec(`CREATE TABLE dependent_history(registration_id uuid REFERENCES registrations);
        INSERT INTO dependent_history VALUES('${id(50)}');`);
      assert.equal((await remove()).status, 'blocked');
      assert.equal(await count('group_members'), 2);
      await db.exec('DROP TABLE dependent_history');
    });
    await t.test('individual entries are rejected', async () => {
      await db.exec("UPDATE registrations SET entry_kind='participant'");
      await assert.rejects(remove, e => e.code === '22023');
      await db.exec("UPDATE registrations SET entry_kind='general_team'");
    });
    await t.test('clean delete keeps participants, team, schedule and audited membership', async () => {
      assert.equal((await remove()).status, 'removed');
      assert.equal(await count('group_members'), 0);
      assert.equal(await count('registrations'), 0);
      assert.equal(await count('participants'), 2);
      assert.equal(await count('organisations'), 1);
      assert.equal(await count('schedules'), 1);
      const audit = (await db.query('SELECT old_value FROM audit_logs')).rows[0].old_value;
      assert.equal(audit.members.length, 2);
      assert.equal((await remove()).status, 'not_found');
      assert.equal(await count('audit_logs'), 1);
    });
    await t.test('anonymous role has no execute privilege', async () => {
      assert.equal((await db.query("SELECT has_function_privilege('anon','public.safe_delete_group_entry(uuid)','EXECUTE') AS allowed")).rows[0].allowed, false);
    });
  } finally { await db.close(); }
});
