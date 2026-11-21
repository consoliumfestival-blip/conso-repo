import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrationUrl = new URL('../migrations/20261121185050_admin_bulk_create_participants.sql', import.meta.url);

test('bulk participant RPC validates inputs, scopes categories/gender, and rolls back partial batches', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE public.festival_calendar (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, gender_mode text, festival_template text);
      CREATE TABLE public.festival_categories (tenant_id uuid NOT NULL, festival_id uuid NOT NULL, code text NOT NULL, is_active boolean NOT NULL);
      CREATE TABLE public.participants (name text NOT NULL, category_code text NOT NULL, gender text NOT NULL, status text NOT NULL, age integer, class_std integer, dob date, public_profile_enabled boolean, show_organisation_public boolean);
      CREATE FUNCTION public.create_participant_with_chest_number(uuid,uuid,uuid,text,text,text,integer,text,date,text,boolean,boolean)
        RETURNS jsonb LANGUAGE plpgsql AS $$
        BEGIN
          IF $4 = 'Trigger failure' THEN RAISE EXCEPTION 'fixture failure'; END IF;
          INSERT INTO public.participants(name,category_code,gender,status,age,class_std,dob,public_profile_enabled,show_organisation_public)
          VALUES ($4,$5,$10,$6,$7,NULLIF($8,'')::integer,$9,$11,$12);
          RETURN '{}'::jsonb;
        END $$;
      INSERT INTO public.festival_calendar VALUES
        ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','both','sahithyolsav'),
        ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','boys_only','sahithyolsav');
      INSERT INTO public.festival_categories VALUES ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','CUSTOM',true);
      SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
    `);
    await db.exec(await readFile(migrationUrl, 'utf8'));
    const rpc = `SELECT public.admin_bulk_create_participants(
      '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000005',$1,$2,$3::text[]
    ) AS count`;

    const created = await db.query(rpc, ['CUSTOM', 'girls', ['Asha', 'Binu']]);
    assert.equal(created.rows[0].count, 2);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.participants')).rows[0].count, 2);
    assert.deepEqual((await db.query('SELECT DISTINCT age, class_std, dob FROM public.participants')).rows, [{ age: null, class_std: null, dob: null }]);
    await assert.rejects(db.query(rpc, ['CUSTOM', 'girls', ['Same name', 'Same name']]));
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.participants')).rows[0].count, 2);
    assert.equal((await db.query(rpc, ['GN', 'boys', ['General category']])).rows[0].count, 1);

    await assert.rejects(db.query(rpc, ['CUSTOM', 'girls', ['New', 'Trigger failure']]));
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.participants')).rows[0].count, 3);
    await assert.rejects(db.query(rpc, ['UNKNOWN', 'girls', ['New']]));
    await assert.rejects(db.query(rpc, ['CUSTOM', null, ['No gender']]));
    await assert.rejects(db.query(`SELECT public.admin_bulk_create_participants(
      '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000005','GN','girls',ARRAY['Blocked']::text[]
    )`));

    const functionName = 'public.admin_bulk_create_participants(uuid,uuid,uuid,text,text,text[])';
    const grants = await db.query(`SELECT has_function_privilege('authenticated', '${functionName}', 'EXECUTE') AS authenticated_can_execute, has_function_privilege('anon', '${functionName}', 'EXECUTE') AS anon_can_execute`);
    assert.deepEqual(grants.rows[0], { authenticated_can_execute: true, anon_can_execute: false });
  } finally {
    await db.close();
  }
});
