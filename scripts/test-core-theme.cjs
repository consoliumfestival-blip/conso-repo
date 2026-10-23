const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const ts=require('typescript');
const tokens=require('../src/constants/coreThemeTokens.json');
const root=path.resolve(__dirname,'..');
const scope=require('./core-theme-scope.json');
const filename=path.join(root,'src/constants/coreTheme.ts');
const localRequire=require('node:module').createRequire(filename);
const sandbox={exports:{},require:name=>name==='react-native'?{Platform:{OS:'web'}}:localRequire(name)};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,sandbox);
const theme=sandbox.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[0.2126,0.7152,0.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
test('validates saved preferences; rejects unknown palettes and malformed storage',()=>{
 for(const raw of [null,'oops','{}','{"mode":"dark","palette":"__proto__"}','{"mode":"pink","palette":"teal"}'])assert.deepEqual(plain(theme.parseCoreAppearance(raw)),{mode:'light',palette:'teal'});
 assert.deepEqual(plain(theme.parseCoreAppearance('{"mode":"system","palette":"plum","ignored":true}')),{mode:'system',palette:'plum'});
});
test('six light presets use off-white surfaces; all share exactly one Dark palette',()=>{
 assert.equal(Object.keys(tokens.palettes).length,6);
 const dark=plain(theme.resolveCoreColors({mode:'dark',palette:'teal'},false));
 for(const palette of Object.keys(tokens.palettes)){
  const light=theme.resolveCoreColors({mode:'light',palette},false);
  assert.notEqual(light.background.toLowerCase(),'#ffffff');assert.notEqual(light.surface.toLowerCase(),'#ffffff');
  assert.deepEqual(plain(theme.resolveCoreColors({mode:'dark',palette},false)),dark);
  assert.deepEqual(plain(theme.resolveCoreColors({mode:'system',palette},true)),dark);
  assert.deepEqual(plain(theme.resolveCoreColors({mode:'system',palette},false)),plain(light));
 }
});
test('primary, body, muted and status text keep readable contrast',()=>{
 for(const palette of Object.keys(tokens.palettes))for(const mode of ['light','dark']){
  const c=theme.resolveCoreColors({mode,palette},false);
  for(const [foreground,background]of [['text','surface'],['textMuted','surface'],['primaryText','surface'],['onPrimary','primary'],['success','successSoft'],['warning','warningSoft'],['danger','dangerSoft'],['info','infoSoft'],['onPrimary','successAction'],['onPrimary','dangerAction'],['onPrimary','infoAction'],['onPrimary','warningAction']]){
   assert.ok(contrast(c[foreground],c[background])>=4.5,`${palette}/${mode} ${foreground}/${background}: ${contrast(c[foreground],c[background]).toFixed(2)}`);
  }
 }
});
test('every CSS reference has a valid RGB companion; opacity retains its fallback',()=>{
 const variables=theme.coreVariables(theme.resolveCoreColors({mode:'dark',palette:'teal'},false));
 for(const role of Object.keys(tokens.legacy))assert.match(variables[theme.coreVariableName(role)+'-rgb'],/^\d+ \d+ \d+$/);
 assert.equal(theme.coreColor('#FFFFFF','surface'),'var(--core-surface, #FFFFFF)');
 assert.equal(theme.coreAlpha(theme.coreColor('#FFFFFF','surface'),0.5),'rgb(var(--core-surface-rgb, 255 255 255) / 0.5)');
 assert.equal(theme.coreAlpha('#ffffff',0.5),'#ffffff80');
 assert.ok(!/rgba?\(var\(--core-[\w-]+\),/.test(fs.readFileSync(path.join(root,'src/global.css'),'utf8')), 'Space-separated RGB variables require slash opacity');
});
test('all generated utility aliases resolve in the Tailwind colour registry',()=>{
 const {utilityColors}=require('./core-theme-colors.cjs'),names=new Set();
 const flatten=(object,prefix='core')=>{for(const [key,value]of Object.entries(object)){if(typeof value==='string')names.add(prefix+'-'+key);else flatten(value,prefix+'-'+key);}};flatten(utilityColors);
 for(const file of scope){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  for(const m of text.matchAll(/\b(?:bg|text|border|ring|divide|outline|placeholder|fill|stroke|from|via|to)-(core-[a-z0-9-]+)/g))assert.ok(names.has(m[1]),`${file}: ${m[1]}`);
 }
});
test('theme changes do not alter service/RPC calls or excluded portal sources',()=>{
 const changed=cp.execFileSync('git',['-c','core.safecrlf=false','diff','--name-only'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split(/\r?\n/);
 assert.ok(!changed.some(p=>/^(src\/app\/(team|judge)\/|src\/services\/|src\/providers\/|supabase\/)/.test(p)), 'Excluded portal, backend or schema changed');
 const calls=text=>{
  const source=ts.createSourceFile('check.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),result=[];
  const inspect=n=>{if(ts.isCallExpression(n)&&/supabase|\b\w*(?:Service|Repository)\./.test(n.expression.getText(source)))result.push(n.getText(source).replace(/\s+/g,''));ts.forEachChild(n,inspect);};inspect(source);return result;
 };
 for(const file of changed.filter(p=>p.endsWith('.tsx')&&!p.endsWith('/_layout.tsx'))){
  let old;try{old=cp.execFileSync('git',['show',`HEAD:${file}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{continue;}
  assert.deepEqual(calls(fs.readFileSync(path.join(root,file),'utf8')),calls(old),`API flow changed in ${file}`);
 }
});
test('chest-card output and persisted defaults retain their original literal colours',()=>{
 const file='src/app/(admin)/participants/chest-cards.tsx';
 const before=cp.execFileSync('git',['show',`HEAD:${file}`],{cwd:root,encoding:'utf8'}),after=fs.readFileSync(path.join(root,file),'utf8');
 const statements=text=>{const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return source.statements.filter(ts.isVariableStatement).flatMap(s=>s.declarationList.declarations.map(d=>[d.name.getText(source),s.getText(source)]));};
 const originals=new Map(statements(before)),current=new Map(statements(after));
 const normalize=text=>text.replace(/[ \t]+$/gm,'');
 for(const name of ['defaultTemplate','readTemplates','createQrUrl','FieldBox','ChestCard'])assert.equal(normalize(current.get(name).replaceAll('legacyCoreOutputColors.','ui.colors.').replace(' ...fixedCoreOutputVariables,','')),normalize(originals.get(name)),name);
 for(const role of Object.keys(tokens.legacy))assert.ok(fs.readFileSync(path.join(root,'src/global.css'),'utf8').includes(`${theme.coreVariableName(role)}: ${tokens.legacy[role]} !important`),`Missing print reset: ${role}`);
});
