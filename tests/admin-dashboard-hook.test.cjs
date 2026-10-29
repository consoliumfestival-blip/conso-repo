const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/core/hooks/useAdminDashboard.ts'),'utf8');
function harness(){
 let tenant='t1',user='u1',festival={data:{id:'f1'},isSuccess:true,isPending:false,isError:false}; const queries=[];let refreshes=0;let finish;
 const pending=new Promise(resolve=>{finish=resolve;});
 const deps={react:{useRef:()=>({current:null})},'@tanstack/react-query':{useQuery:options=>{queries.push(options);return {data:{participantsCount:3},dataUpdatedAt:123,isError:false,isLoading:false,refetch:()=>{refreshes++;return pending;}};}},'../../services/adminDashboardService':{adminDashboardService:{getDashboardStats:()=>{}}},'../store/authStore':{useAuthStore:()=>({tenant_id:tenant,user:{id:user}})},'./useFestival':{useFestival:()=>({useActiveFestival:()=>festival})}};
 const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(name=>deps[name],mod,mod.exports);
 return {render:()=>mod.exports.useAdminDashboard().useStats(),queries,scope:(t,u,f)=>{tenant=t;user=u;festival={...festival,data:{id:f}};},unresolved:()=>{festival={...festival,isSuccess:false,isPending:true};},get refreshes(){return refreshes;},finish};
}
test('dashboard cache isolates festival/user/tenant and waits for scope',()=>{
 const h=harness();h.render();const first=h.queries.at(-1);h.scope('t1','u1','f2');h.render();assert.notDeepEqual(h.queries.at(-1).queryKey,first.queryKey);h.scope('t2','u2','f2');h.render();assert.notDeepEqual(h.queries.at(-1).queryKey,first.queryKey);h.unresolved();h.render();assert.equal(h.queries.at(-1).enabled,false);
 for(const key of ['retry','refetchOnMount','refetchOnWindowFocus','refetchOnReconnect','refetchInterval'])assert.equal(first[key],false);
 assert.equal(first.staleTime,Infinity);
});
test('repeated manual update uses one in-flight refresh and preserves prior data',async()=>{
 const h=harness();const result=h.render();const a=result.refetch();const b=result.refetch();assert.equal(a,b);assert.equal(h.refreshes,1);assert.equal(result.data.participantsCount,3);assert.equal(result.dataUpdatedAt,123);h.finish();await a;
});
