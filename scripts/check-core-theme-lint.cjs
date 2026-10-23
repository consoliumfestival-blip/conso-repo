const {ESLint}=require('eslint');
const cp=require('child_process'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const engine=new ESLint();
 const files=[...require('./core-theme-scope.json'),'src/app/_layout.tsx','src/constants/coreTheme.ts','src/constants/coreThemeOutput.ts','src/constants/designSystem.ts','src/core/store/coreAppearanceStore.ts'].filter(p=>fs.existsSync(path.join(root,p)));
 const current=await engine.lintFiles(files),added=[];let currentErrors=0,baselineErrors=0,newWarnings=0;
 for(const result of current){
  const file=path.relative(root,result.filePath).replaceAll('\\','/');let previous=[];
  try{const original=cp.execFileSync('git',['show',`HEAD:${file}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});previous=(await engine.lintText(original,{filePath:result.filePath}))[0]?.messages??[];}catch{}
  const messageKey=m=>`${m.ruleId}:${m.message.replace(/at line \d+/g,'at line')}`;
  const known=new Set(previous.map(messageKey));
  currentErrors+=result.errorCount;baselineErrors+=previous.filter(m=>m.severity===2).length;
  for(const m of result.messages)if(!known.has(messageKey(m))){if(m.severity===2)added.push({file,line:m.line,rule:m.ruleId,message:m.message});else {newWarnings++;console.log(`${file}:${m.line}: ${m.ruleId}: ${m.message}`);}}
 }
 console.log(JSON.stringify({currentErrors,baselineErrors,newErrors:added,newWarnings},null,2));
 if(added.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
