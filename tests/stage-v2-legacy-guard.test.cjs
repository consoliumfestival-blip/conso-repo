const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
test('legacy read guards preserve schedule detail, v1 rollback, signatures and replay',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE FUNCTION public.stage_assert_admin_access() RETURNS uuid LANGUAGE sql AS 'SELECT ''00000000-0000-0000-0000-000000000001''::uuid';
 CREATE FUNCTION public.stage_management_read_mode() RETURNS text LANGUAGE sql AS 'SELECT current_setting(''test.mode'')';
 CREATE FUNCTION public.stage_venue_portal_read_mode(uuid) RETURNS text LANGUAGE sql AS 'SELECT current_setting(''test.mode'')';
 CREATE FUNCTION public.stage_venue_portal_data(p_venue_id uuid,p_pin text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS 'BEGIN RETURN jsonb_build_object(''legacy'',true); END;';`);
 for(const name of ['get_stage_management_registrations','get_stage_management_registrations_scoped'])await db.exec(`CREATE FUNCTION public.${name}(p_schedule_id uuid DEFAULT NULL,p_festival_id uuid DEFAULT NULL) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER AS 'DECLARE v_tenant_id uuid; BEGIN v_tenant_id := public.stage_assert_admin_access(); RETURN 7; END;';`);
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261029035112_stage_v2_legacy_overview_guard.sql'),'utf8');await db.exec(sql);await db.exec(sql);
 await db.exec("SELECT set_config('test.mode','v2',false)");
 for(const name of ['get_stage_management_registrations','get_stage_management_registrations_scoped']){
 await assert.rejects(db.query(`SELECT public.${name}(NULL,NULL)`),/v2 summaries/);
 assert.equal((await db.query(`SELECT public.${name}('00000000-0000-0000-0000-000000000001',NULL) AS n`)).rows[0].n,7);
 }
 assert.match((await db.query("SELECT public.stage_venue_portal_data(NULL,'pin') AS d")).rows[0].d.error,/v2/);
 await db.exec("SELECT set_config('test.mode','v1',false)");
 for(const name of ['get_stage_management_registrations','get_stage_management_registrations_scoped'])assert.equal((await db.query(`SELECT public.${name}(NULL,NULL) AS n`)).rows[0].n,7);
 assert.equal((await db.query("SELECT public.stage_venue_portal_data(NULL,'pin') AS d")).rows[0].d.legacy,true);
 }finally{await db.close();}
});
