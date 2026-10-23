// Bundle real UI components with explicit fixture-only service replacements.
// No auth bypass or fixture endpoint is added to the production application.
const path=require('path'),fs=require('fs'),http=require('http'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
const output=path.join(require('os').tmpdir(),'conso-core-appearance-preview');
fs.mkdirSync(output,{recursive:true});
const fixture='./scripts/fixtures/core-appearance-stubs.tsx';
const aliases=['expo-router','expo-status-bar','@react-navigation/native','@/core/hooks/useFestival','@/core/store/authStore','@/core/store/judgeApprovalStore','@/components/ui/JudgeApprovalToast','@/core/hooks/useCodeLetterUpdates','@/services/stageManagementService','@/services/authService','@/core/config/dev_config'];
(async()=>{
 const args=['--yes','esbuild','scripts/fixtures/core-appearance-entry.tsx','--bundle','--platform=browser','--format=iife','--loader:.js=jsx','--jsx=automatic','--jsx-import-source=nativewind','--alias:react-native=react-native-web','--alias:lucide-react-native=lucide-react',...aliases.map(name=>`--alias:${name}=${fixture}`),'--resolve-extensions=.web.tsx,.tsx,.web.ts,.ts,.web.jsx,.jsx,.web.js,.js,.json','--define:__DEV__=true',`--outfile=${path.join(output,'bundle.js')}`];
 args.push('--define:process.env={}');
 args[1]='esbuild@0.28.2';
 cp.execFileSync(process.platform==='win32'?'cmd.exe':'npx',process.platform==='win32'?['/d','/s','/c','npx.cmd',...args]:args,{cwd:root,stdio:'inherit'});
 const css=fs.readdirSync(path.join(root,'dist/_expo/static/css')).find(x=>x.endsWith('.css'));
 fs.copyFileSync(path.join(root,'dist/_expo/static/css',css),path.join(output,'style.css'));
 const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root" style="display:flex;flex-direction:column;height:100vh"></div><script src="/bundle.js"></script></body></html>';
 if(process.argv.includes('--bundle-only')) { console.log('Preview bundle refreshed.'); return; }
 http.createServer((req,res)=>{
  if(/^\/fonts\/[a-zA-Z0-9_.-]+$/.test(req.url)){
   const font=path.join(root,'dist',req.url.slice(1));
   if(fs.existsSync(font)){res.setHeader('Content-Type',font.endsWith('.woff2')?'font/woff2':'font/ttf');res.end(fs.readFileSync(font));return;}
  }
  const file=req.url==='/bundle.js'?'bundle.js':req.url==='/style.css'?'style.css':null;
  res.setHeader('Content-Type',file?.endsWith('.js')?'text/javascript':file?'text/css':'text/html');res.end(file?fs.readFileSync(path.join(output,file)):html);
 }).listen(8102,'127.0.0.1',()=>console.log('Isolated preview: http://127.0.0.1:8102'));
})().catch(error=>{console.error(error);process.exitCode=1;});
