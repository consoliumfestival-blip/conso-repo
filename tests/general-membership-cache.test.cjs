const test=require('node:test');const assert=require('node:assert/strict');
const ts=require('typescript'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {QueryClient}=require('@tanstack/react-query');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/core/utils/invalidateGeneralMembership.ts'),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports:exportsObject});
test('creating a General entry refreshes its members and festival without refetching unrelated profiles',async()=>{
 const client=new QueryClient();
 const member=['publicCandidateProfile','member'];const outsider=['publicCandidateProfile','outsider'];
 const general=['general-team-entries','festival'];const otherFestival=['general-team-entries','other'];
 const stage=['stage-management-registrations','tenant','festival','schedule'];const otherStage=['stage-management-registrations','tenant','other','schedule'];
 const history=['participantGeneralTeamResults','child'];const otherHistory=['participantGeneralTeamResults','other-child'];
 client.setQueryData(member,{profile:{id:'child'}});client.setQueryData(outsider,{profile:{id:'other-child'}});
 for(const key of [general,otherFestival,stage,otherStage,history,otherHistory])client.setQueryData(key,[]);
 await exportsObject.invalidateGeneralMembership(client,'festival',['child']);
 for(const key of [member,general,stage,history])assert.equal(client.getQueryState(key).isInvalidated,true,JSON.stringify(key));
 for(const key of [outsider,otherFestival,otherStage,otherHistory])assert.equal(client.getQueryState(key).isInvalidated,false,JSON.stringify(key));
 client.clear();
});
