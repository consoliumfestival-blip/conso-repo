const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
function service(mode){const calls=[];const mod={exports:{}};const source=fs.readFileSync(path.join(__dirname,'../src/services/stageManagementService.ts'),'utf8');new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(()=>({supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:name.endsWith('read_mode')?mode:[],error:null};}}}),mod,mod.exports);return {api:mod.exports.stageManagementService,calls};}
test('v2 blocks legacy overview/venue payloads but keeps scoped check-in reads',async()=>{
 const {api,calls}=service('v2');await assert.rejects(api.getRegistrations({festivalId:'festival'}),/v2 summaries/);await assert.rejects(api.getVenuePortalData('venue','pin'),/uses v2/);
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.name.endsWith('read_mode')));
 const scoped=service('v2');await scoped.api.getRegistrations({scheduleId:'schedule'});assert.ok(scoped.calls.every(c=>c.args.p_schedule_id==='schedule'));assert.equal(scoped.calls[0].name,'get_stage_management_registrations_with_letters');
});
test('v1 rollback still permits legacy overview and venue paths',async()=>{
 const {api,calls}=service('v1');await api.getRegistrations({festivalId:'festival'});await api.getVenuePortalData('venue','pin');assert.ok(calls.some(c=>c.name==='get_stage_management_registrations_with_letters'));assert.ok(calls.some(c=>c.name==='stage_venue_portal_data_with_letters'));
});
