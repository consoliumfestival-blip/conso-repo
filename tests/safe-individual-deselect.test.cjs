const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('individual deselect leaves no participant-item registration history', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE TABLE profiles(id uuid PRIMARY KEY,tenant_id uuid,role text,is_superadmin boolean);
      CREATE TABLE festival_calendar(id uuid PRIMARY KEY,tenant_id uuid);
      CREATE TABLE organisations(id uuid PRIMARY KEY,tenant_id uuid);
      CREATE TABLE participants(id uuid PRIMARY KEY,name text,tenant_id uuid,festival_id uuid,organisation_id uuid,
        category_code text,chest_number text,gender text,status text,plagiarism_ban_until date);
      CREATE TABLE items(id uuid PRIMARY KEY,tenant_id uuid,festival_id uuid,item_code text,item_name_en text,
        item_name_ml text,category_codes text[],gender text,participation_type text,group_min_members integer,
        group_max_members integer,is_active boolean);
      CREATE TABLE registrations(id uuid PRIMARY KEY,tenant_id uuid,festival_id uuid,item_id uuid,participant_id uuid,
        organisation_id uuid,entry_kind text,status text,is_group_registration boolean,is_verified boolean,
        is_locked boolean,code_letter_fixed boolean,code_letter text);
      CREATE TABLE team_leader_program_completions(tenant_id uuid,festival_id uuid,organisation_id uuid,item_id uuid,
        assigned_participant_ids uuid[]);
      CREATE TABLE audit_logs(tenant_id uuid,user_id uuid,action text,table_name text,record_id uuid,old_value jsonb,new_value jsonb);
      CREATE TABLE mark_entries(registration_id uuid);
      CREATE TABLE results(registration_id uuid);
      CREATE TABLE schedules(id uuid PRIMARY KEY,festival_id uuid,item_id uuid);
      CREATE TABLE attendance(participant_id uuid,schedule_id uuid);
      CREATE TABLE certificates(participant_id uuid,item_id uuid);
      CREATE FUNCTION get_team_leader_context() RETURNS TABLE(parent_tenant_id uuid,festival_id uuid,organisation_id uuid)
        LANGUAGE sql AS $$SELECT '${id(10)}'::uuid,'${id(11)}'::uuid,
          CASE WHEN auth.uid()='${id(4)}'::uuid THEN '${id(99)}'::uuid ELSE '${id(12)}'::uuid END$$;
      CREATE FUNCTION get_visible_organisations(p_tenant_id uuid) RETURNS TABLE(id uuid,tenant_id uuid)
        LANGUAGE sql AS $$SELECT id,tenant_id FROM public.organisations WHERE tenant_id=p_tenant_id$$;
      INSERT INTO profiles VALUES('${id(1)}','${id(10)}','admin',false),
        ('${id(2)}','${id(20)}','admin',false),('${id(3)}','${id(10)}','team_leader',false),
        ('${id(4)}','${id(10)}','team_leader',false);
      INSERT INTO festival_calendar VALUES('${id(11)}','${id(10)}');
      INSERT INTO organisations VALUES('${id(12)}','${id(10)}');
      INSERT INTO items VALUES('${id(13)}','${id(10)}','${id(11)}','IND-01','Solo',NULL,ARRAY['JR'],NULL,'individual',1,1,true);
      INSERT INTO participants VALUES('${id(31)}','Alpha','${id(10)}','${id(11)}','${id(12)}','JR','101','boys','approved',NULL);
      INSERT INTO registrations VALUES('${id(50)}','${id(10)}','${id(11)}','${id(13)}','${id(31)}','${id(12)}',
        'participant','approved',false,false,false,false,NULL);
      INSERT INTO team_leader_program_completions VALUES('${id(10)}','${id(11)}','${id(12)}','${id(13)}',ARRAY['${id(31)}']::uuid[]);
      INSERT INTO audit_logs(tenant_id,user_id,action,table_name,record_id,old_value,new_value)
        VALUES('${id(10)}','${id(1)}','registration_create','registrations','${id(50)}',
          jsonb_build_object('participant_id','${id(31)}','item_id','${id(13)}'),
          jsonb_build_object('participant_id','${id(31)}','item_id','${id(13)}'));
    `);
    const migration = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20261024022451_safe_individual_deselect.sql'), 'utf8');
    await db.exec(migration);
    const actor = async n => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']);
    const count = async table => Number((await db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n);
    await t.test('anonymous and a Team Leader from another assignment are denied', async () => {
      for (const actorId of [null, 4]) {
        await actor(actorId);
        await assert.rejects(db.query('SELECT safe_unassign_registration($1)', [id(50)]), e => e.code === '42501');
        assert.equal(await count('registrations'), 1);
      }
    });
    await t.test('assigned Team Leader removes the row and identifying data', async () => {
      await actor(3);
      const result = (await db.query('SELECT safe_unassign_registration($1) result', [id(50)])).rows[0].result;
      assert.equal(result.status, 'removed');
      assert.equal(await count('registrations'), 0);
      assert.equal(await count('team_leader_program_completions'), 0);
      assert.equal(await count('audit_logs'), 1);
      const audit = (await db.query('SELECT record_id,old_value,new_value FROM audit_logs')).rows[0];
      assert.equal(audit.record_id, null);
      assert.equal(audit.old_value, null);
      assert.deepEqual(audit.new_value, { status: 'removed', entry_kind: 'participant' });
    });
    await t.test('marks block removal without changing registration or audit', async () => {
      await db.exec(`
        INSERT INTO registrations VALUES('${id(51)}','${id(10)}','${id(11)}','${id(13)}','${id(31)}','${id(12)}',
          'participant','approved',false,false,false,false,NULL);
        INSERT INTO mark_entries VALUES('${id(51)}');
      `);
      const beforeAudits = await count('audit_logs');
      const result = (await db.query('SELECT safe_unassign_registration($1) result', [id(51)])).rows[0].result;
      assert.equal(result.status, 'blocked');
      assert.equal(await count('registrations'), 1);
      assert.equal(await count('audit_logs'), beforeAudits);
    });
    await t.test('group registrations must use the group workflow', async () => {
      await db.query("UPDATE registrations SET entry_kind='general_team',is_group_registration=true WHERE id=$1", [id(51)]);
      await assert.rejects(db.query('SELECT safe_unassign_registration($1)', [id(51)]), e => e.code === '22023');
      assert.equal(await count('registrations'), 1);
    });
  } finally { await db.close(); }
});
