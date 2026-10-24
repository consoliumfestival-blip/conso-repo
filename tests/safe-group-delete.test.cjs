const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const migrations = path.resolve(__dirname, '../supabase/migrations');

async function createDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA group_entry_private;
    CREATE TABLE group_entry_private.member_edit_authorizations(transaction_id bigint,registration_id uuid,actor_id uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE profiles(id uuid PRIMARY KEY,tenant_id uuid,role text,is_superadmin boolean);
    CREATE TABLE tenants(id uuid PRIMARY KEY);
    CREATE TABLE festival_calendar(id uuid PRIMARY KEY,tenant_id uuid,general_category_enabled boolean,is_active boolean);
    CREATE TABLE organisations(id uuid PRIMARY KEY,tenant_id uuid,name text);
    CREATE TABLE participants(id uuid PRIMARY KEY,name text,chest_number text,tenant_id uuid,festival_id uuid,
      organisation_id uuid,category_code text,gender text,status text,plagiarism_ban_until date);
    CREATE TABLE items(id uuid PRIMARY KEY,tenant_id uuid,festival_id uuid,item_code text,item_name_en text,
      item_name_ml text,category_codes text[],gender text,participation_type text,group_min_members integer,
      group_max_members integer,is_active boolean);
    CREATE TABLE registrations(id uuid PRIMARY KEY,tenant_id uuid,festival_id uuid,item_id uuid,
      organisation_id uuid,participant_id uuid,entry_kind text,status text,is_group_registration boolean,
      is_verified boolean DEFAULT false,is_locked boolean DEFAULT false,code_letter_fixed boolean DEFAULT false,
      code_letter text,group_leader_participant_id uuid,raw_group_members jsonb);
    CREATE TABLE group_members(id uuid PRIMARY KEY,registration_id uuid REFERENCES registrations,
      participant_id uuid REFERENCES participants,member_order integer,is_locked boolean DEFAULT false);
    CREATE TABLE team_leader_program_completions(tenant_id uuid,festival_id uuid,organisation_id uuid,item_id uuid,
      assigned_participant_ids uuid[],completed_by uuid,completed_at timestamptz);
    CREATE TABLE mark_entries(registration_id uuid REFERENCES registrations);
    CREATE TABLE results(registration_id uuid REFERENCES registrations);
    CREATE TABLE schedules(id uuid PRIMARY KEY,item_id uuid,festival_id uuid);
    CREATE TABLE attendance(participant_id uuid REFERENCES participants,schedule_id uuid REFERENCES schedules);
    CREATE TABLE certificates(participant_id uuid REFERENCES participants,item_id uuid);
    CREATE TABLE audit_logs(tenant_id uuid,user_id uuid,action text,table_name text,record_id uuid,old_value jsonb,new_value jsonb);
    CREATE FUNCTION get_visible_organisations(p_tenant_id uuid) RETURNS TABLE(id uuid,tenant_id uuid)
      LANGUAGE sql AS $$SELECT id,tenant_id FROM public.organisations WHERE tenant_id=p_tenant_id$$;
    CREATE FUNCTION get_team_leader_context() RETURNS TABLE(parent_tenant_id uuid,festival_id uuid,organisation_id uuid)
      LANGUAGE sql AS $$SELECT '${id(10)}'::uuid,'${id(11)}'::uuid,
        CASE WHEN auth.uid()='${id(4)}'::uuid THEN '${id(99)}'::uuid ELSE '${id(12)}'::uuid END$$;
    INSERT INTO tenants VALUES('${id(10)}');
    INSERT INTO profiles VALUES('${id(1)}','${id(10)}','admin',false),
      ('${id(2)}','${id(20)}','admin',false),('${id(3)}','${id(10)}','team_leader',false),
      ('${id(4)}','${id(10)}','team_leader',false);
    INSERT INTO festival_calendar VALUES('${id(11)}','${id(10)}',true,true);
    INSERT INTO organisations VALUES('${id(12)}','${id(10)}','Demo team');
    INSERT INTO participants(id,name,chest_number,tenant_id,festival_id,organisation_id,category_code,gender,status)
      VALUES('${id(31)}','Alpha','101','${id(10)}','${id(11)}','${id(12)}','JR','boys','approved'),
      ('${id(32)}','Beta','102','${id(10)}','${id(11)}','${id(12)}','JR','boys','approved'),
      ('${id(33)}','Gamma','103','${id(10)}','${id(11)}','${id(12)}','JR','boys','approved');
    INSERT INTO items VALUES('${id(13)}','${id(10)}','${id(11)}','GRP-01','Group item',NULL,ARRAY['JR'],'boys','group',2,4,true);
    INSERT INTO schedules VALUES('${id(40)}','${id(13)}','${id(11)}');
  `);
  const source = fs.readFileSync(path.join(migrations, '20261022122300_source_structure_sync.sql'), 'utf8');
  for (const name of ['guard_member', 'ensure_leader_membership', 'validate_roster']) {
    const definition = source.match(new RegExp(`CREATE OR REPLACE FUNCTION group_entry_private\\.${name}\\([\\s\\S]*?END \\$function\\$;`));
    assert.ok(definition, `actual ${name} function is available`);
    await db.exec(definition[0]);
  }
  await db.exec(`
    CREATE TRIGGER roster_guard BEFORE INSERT OR DELETE OR UPDATE ON group_members
      FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_member();
    CREATE CONSTRAINT TRIGGER roster_leader AFTER INSERT OR UPDATE OR DELETE ON group_members
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION group_entry_private.ensure_leader_membership();
  `);
  await db.exec(fs.readFileSync(path.join(migrations, '20261024022459_safe_group_deselect.sql'), 'utf8'));
  const actor = async n => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']);
  const seed = async () => db.exec(`
    INSERT INTO registrations VALUES('${id(50)}','${id(10)}','${id(11)}','${id(13)}','${id(12)}',NULL,
      'general_team','approved',true,false,false,false,NULL,'${id(31)}','["Alpha","Beta","Gamma"]');
    INSERT INTO group_members VALUES('${id(51)}','${id(50)}','${id(31)}',1,false),
      ('${id(52)}','${id(50)}','${id(32)}',2,false),('${id(53)}','${id(50)}','${id(33)}',3,false);
    INSERT INTO team_leader_program_completions(tenant_id,festival_id,organisation_id,item_id,assigned_participant_ids,completed_by)
      VALUES('${id(10)}','${id(11)}','${id(12)}','${id(13)}',ARRAY['${id(31)}','${id(32)}','${id(33)}']::uuid[],'${id(1)}');
    INSERT INTO audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
      VALUES('${id(10)}','${id(1)}','group_roster_edit','registrations','${id(50)}',
        jsonb_build_object('member_ids',ARRAY['${id(31)}','${id(32)}','${id(33)}']::uuid[]),
        jsonb_build_object('member_ids',ARRAY['${id(31)}','${id(32)}','${id(33)}']::uuid[]));
  `);
  return { db, actor, seed };
}

test('group deselect preserves official history and removes identifying snapshots on success', async t => {
  const { db, actor, seed } = await createDb();
  try {
    await seed();
    const remove = (memberIds = [id(31), id(32), id(33)]) => db.query('SELECT safe_delete_group_entry_if_unchanged($1,$2) AS result', [
      id(50), memberIds,
    ]);
    const count = async table => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

    for (const [label, actorId] of [['anonymous', null], ['other tenant admin', 2], ['other team leader', 4]]) {
      await t.test(`${label} cannot delete`, async () => {
        await actor(actorId);
        await assert.rejects(remove, e => e.code === '42501');
        assert.equal(await count('group_members'), 3);
      });
    }
    await actor(1);
    for (const [label, setup, cleanup] of [
      ['marks', `INSERT INTO mark_entries VALUES('${id(50)}')`, 'DELETE FROM mark_entries'],
      ['results', `INSERT INTO results VALUES('${id(50)}')`, 'DELETE FROM results'],
      ['check-in', `UPDATE registrations SET is_verified=true WHERE id='${id(50)}'`, `UPDATE registrations SET is_verified=false WHERE id='${id(50)}'`],
      ['locked group member', `UPDATE group_members SET is_locked=true WHERE registration_id='${id(50)}'`, `UPDATE group_members SET is_locked=false WHERE registration_id='${id(50)}'`],
      ['fixed letter', `UPDATE registrations SET code_letter_fixed=true WHERE id='${id(50)}'`, `UPDATE registrations SET code_letter_fixed=false WHERE id='${id(50)}'`],
      ['code letter', `UPDATE registrations SET code_letter='A' WHERE id='${id(50)}'`, `UPDATE registrations SET code_letter=NULL WHERE id='${id(50)}'`],
      ['attendance', `INSERT INTO attendance VALUES('${id(31)}','${id(40)}')`, 'DELETE FROM attendance'],
      ['certificate', `INSERT INTO certificates VALUES('${id(31)}','${id(13)}')`, 'DELETE FROM certificates'],
    ]) {
      await t.test(`${label} blocks deletion and retains all members`, async () => {
        await db.exec(setup);
        assert.equal((await remove()).rows[0].result.status, 'blocked');
        assert.equal(await count('group_members'), 3);
        assert.equal(await count('registrations'), 1);
        await db.exec(cleanup);
      });
    }
    await t.test('stale roster cannot be removed', async () => {
      await assert.rejects(db.query('SELECT safe_delete_group_entry_if_unchanged($1,$2)', [id(50), [id(31), id(32)]]), e => e.code === '40001');
      assert.equal(await count('group_members'), 3);
    });
    await t.test('Team Leader can remove entries only from the assigned team', async () => {
      await db.exec('BEGIN');
      try {
        await actor(3);
        const result = (await db.query('SELECT safe_delete_group_entry_if_unchanged($1,$2) AS result', [id(50), [id(31), id(32), id(33)]])).rows[0].result;
        assert.equal(result.status, 'removed');
      } finally {
        await db.exec('ROLLBACK');
        await actor(1);
      }
      assert.equal(await count('group_members'), 3);
    });
    await t.test('removing one member leaves the group and teammate intact', async () => {
      const result = (await db.query('SELECT safe_remove_group_member($1,$2,$3,NULL) AS result', [id(50), id(33), [id(31), id(32), id(33)]])).rows[0].result;
      assert.equal(result.status, 'removed');
      assert.equal(await count('group_members'), 2);
      assert.equal(Number((await db.query('SELECT count(*) n FROM group_members WHERE registration_id=$1 AND participant_id=$2', [id(50), id(33)])).rows[0].n), 0);
      assert.equal(await count('registrations'), 1);
      assert.equal(await count('team_leader_program_completions'), 0);
      assert.equal(Number((await db.query('SELECT count(*) n FROM audit_logs WHERE old_value ? \'member_ids\' OR new_value ? \'member_ids\'')).rows[0].n), 0);
    });
    await t.test('whole group delete removes its history but preserves participants/team/schedule', async () => {
      const result = (await remove([id(31), id(32)])).rows[0].result;
      assert.equal(result.status, 'removed');
      assert.equal(await count('group_members'), 0);
      assert.equal(await count('registrations'), 0);
      assert.equal(await count('team_leader_program_completions'), 0);
      assert.equal(await count('participants'), 3);
      assert.equal(await count('organisations'), 1);
      assert.equal(await count('schedules'), 1);
      assert.equal(await count('audit_logs'), 2);
      const audits = (await db.query('SELECT record_id,old_value,new_value FROM audit_logs')).rows;
      assert.ok(audits.every(audit => audit.record_id === null && audit.old_value === null));
      assert.ok(audits.every(audit => audit.new_value.status === 'removed'));
    });
    await t.test('anonymous role has no execute privilege', async () => {
      assert.equal((await db.query("SELECT has_function_privilege('anon','public.safe_delete_group_entry(uuid)','EXECUTE') AS allowed")).rows[0].allowed, false);
    });
  } finally { await db.close(); }
});
