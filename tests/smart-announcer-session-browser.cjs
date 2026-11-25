// Use an isolated Expo export with the announcer-fixture Supabase URL.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.ANNOUNCER_DIST;
assert(root, 'ANNOUNCER_DIST must point at a fixture export');
const server = http.createServer((req, res) => {
  const requested = path.join(root, new URL(req.url, 'http://localhost').pathname);
  const file = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(root, 'index.html');
  res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const token = 'a'.repeat(64), device = 'd'.repeat(64);
const tenant = '20000000-0000-0000-0000-000000000001', festival = '30000000-0000-0000-0000-000000000001', team = '60000000-0000-0000-0000-000000000001';
const ids = [1,2,3,4,5].map(i => `40000000-0000-0000-0000-00000000000${i}`);
const user = { id: '10000000-0000-0000-0000-000000000001', email: 'admin@example.invalid', app_metadata: {}, user_metadata: {}, aud: 'authenticated' };
const expires_at = Math.floor(Date.now()/1000)+3600;
const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const auth = { user, expires_at, access_token: `${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:user.id,exp:expires_at,role:'authenticated'})}.fixture`, refresh_token:'fixture',token_type:'bearer' };
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const browser = await chromium.launch({headless:true,channel:'chrome'});
 try {
  for (const [width,height] of [[320,700],[768,1024],[1024,768],[1440,900]]) {
   const context = await browser.newContext({viewport:{width,height}});
   let active=false, sent=false, announced=false, loginCount=0;
   const errors=[];
   await context.route('**/*', async route => {
    const url=new URL(route.request().url());
    if (url.hostname==='localhost' || url.hostname==='127.0.0.1') return route.continue();
    if (url.hostname!=='announcer-fixture.supabase.co') return route.abort();
    const name=url.pathname.split('/').pop(), req=route.request();
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
    if(req.method()==='OPTIONS') return route.fulfill({status:204,headers});
    const body=req.method()==='POST' ? req.postDataJSON() : {};
    let json=[];
    if(name==='user') json=user;
    if(name==='profiles') json={role:'admin',tenant_id:tenant,is_superadmin:false};
    if(name==='get_my_access_status') json={access_disabled:false};
    if(name==='get_tenant_feature_settings') json={modules:{smart_announcer:true}};
    if(name==='festival_calendar') json=[{id:festival,tenant_id:tenant,is_active:true,festival_name:'Fixture Festival'}];
    if(name==='get_admin_published_results') json=ids.map((id,i)=>({result_id:id,item_id:id,festival_id:festival,tenant_id:tenant,item_name:`Item ${i+1}`,published:true,result_status:'published',public_visible:false}));
    if(name==='smart_announcer_recommendations') json={teams:[{id:team,name:'Team A'}],items:[]};
    if(name==='smart_announcer_admin_queue') json=sent?ids.map((id,i)=>({item_id:id,queue_position:i+1,announced_at:announced?'2026-11-25T00:00:00Z':null})):[];
    if(name==='smart_announcer_team_candidates') json=ids.map((id,i)=>({id,name:`Item ${i+1}`,category_codes:['GENERAL']}));
    if(name==='smart_announcer_batch_preview') json={items:(body.p_item_ids||ids).map(id=>({item_id:id,team_rank:1,team_points:120,leader_gap:5,standings:[{organisation_id:team,total_points:120,projected_rank:1}]})),schedules:ids.map(id=>({item_id:id,venue:'Main stage',start_time:'2026-11-25T12:00:00Z'})),candidate_count:5};
    if(name==='smart_announcer_session_admin') {
     if(body.p_action==='create') {active=true;json={id:festival,token,pin:'1234'};}
     else if(body.p_action==='close') {active=false;json=null;}
     else json=active?{id:festival,token}:null;
    }
    if(name==='smart_announcer_send_batch') {assert.equal(body.p_item_ids.length,5);sent=true;json=null;}
    if(name==='smart_announcer_device_login') {loginCount++;assert.equal(body.p_pin,'1234');json={status:'ok',device_token:device};}
    if(name==='smart_announcer_device_queue') {
     assert.equal(body.p_device_token,device);
     if(body.p_item_id) announced=true;
     json=active?{status:'ok',items:[{item_id:ids[0],item_name:'Test result',category_codes:['GENERAL'],announced_at:announced?'2026-11-25T00:00:00Z':null,result_details:[{participant_name:'Test participant',team_name:'Team A',rank:2,grade:'A',points_awarded:5}]}]}:{status:'unavailable'};
    }
    return route.fulfill({status:200,headers,json});
   });
   const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
   const origin=`http://localhost:${server.address().port}`;
   await page.addInitScript(s=>localStorage.setItem('sb-announcer-fixture-auth-token',JSON.stringify(s)),auth);
   await page.goto(`${origin}/smart-announcer`);
   try { await page.getByRole('button',{name:'Create session',exact:true}).click({timeout:15000}); }
   catch(error) { console.error('Browser state:',page.url(),await page.locator('body').innerText(),errors); throw error; }
   await page.getByLabel('Festival team').selectOption(team);
   await page.getByText('Projected team rank #1 · 120 points').first().waitFor();
   await page.getByRole('button',{name:'Send to Announcer',exact:true}).click();
   await page.getByText('Results sent to the announcer.').waitFor();
   assert(sent);
   await page.reload();
   await page.getByLabel('Announcer link').waitFor();
   assert.equal(await page.getByRole('button',{name:'Create session',exact:true}).count(),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Admin overflow at ${width}`);
   // Remove admin auth before opening the public link.
   await page.evaluate(()=>localStorage.removeItem('sb-announcer-fixture-auth-token'));
   await page.goto(`${origin}/announcer/session/${token}`);
   await page.getByLabel('Announcer PIN').fill('1234');
   await page.getByRole('button',{name:'Open session',exact:true}).click();
   await page.getByText('Test result',{exact:true}).waitFor();
   assert.equal(await page.getByText(/Projected team rank/).count(),0);
   await page.reload(); await page.getByText('Test result',{exact:true}).waitFor(); assert.equal(loginCount,1);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Portal overflow at ${width}`);
   await page.getByRole('button',{name:'✓ Mark Announced',exact:true}).click();
   await page.getByRole('button',{name:'Announced',exact:true}).click();
   await page.getByText('Test result',{exact:true}).waitFor();
   active=false; await page.getByRole('button',{name:'Refresh',exact:true}).click();
   await page.getByText('This session is closed or temporarily unavailable. Contact your admin.').waitFor();
   assert.equal(await page.getByText('Test result',{exact:true}).count(),0);
   assert.deepEqual(errors,[]);
   console.log(`Admin/session workflow passed at ${width}x${height}`);
   await context.close();
  }
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
