// Compare diagnostics against HEAD without resetting or stashing the worktree.
const fs=require('fs'),path=require('path'),cp=require('child_process'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});
const changed=git('diff','--name-only').trim().split(/\r?\n/).filter(file=>/\.[cm]?tsx?$/.test(file));
const originals=new Map(changed.map(file=>[path.join(root,file).toLowerCase(),git('show',`HEAD:${file}`)]));
const tracked=new Set(git('ls-files').split(/\r?\n/).map(file=>path.normalize(path.join(root,file)).toLowerCase()));
const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
const baselineNames=parsed.fileNames.filter(file=>tracked.has(path.normalize(file).toLowerCase())||/expo-env\.d\.ts$|[\\/]\.expo[\\/]/.test(file));
const host=ts.createCompilerHost(parsed.options),read=host.readFile;
host.readFile=file=>originals.get(path.resolve(file).toLowerCase())??read(file);
const before=ts.getPreEmitDiagnostics(ts.createProgram(baselineNames,parsed.options,host));
const after=ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames,parsed.options));
const key=d=>`${d.file?path.relative(root,d.file.fileName):''}:TS${d.code}:${ts.flattenDiagnosticMessageText(d.messageText,' ')}`;
const known=new Set(before.map(key)),added=after.filter(d=>!known.has(key(d)));
console.log(JSON.stringify({baselineErrors:before.length,currentErrors:after.length,newErrors:added.map(key)},null,2));
if(added.length)process.exitCode=1;
