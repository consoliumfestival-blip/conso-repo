const fs=require('fs'),ts=require('typescript');
const scope=require('./core-theme-scope.json');
const path=require('path');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name).replaceAll('\\','/')]);
const missing=['src/app/(admin)','src/app/(super)','src/app/(auth)'].flatMap(walk).filter(file=>file.endsWith('.tsx')&&!scope.includes(file));
if(missing.length){console.error('Uncovered core routes:',missing);process.exitCode=1;}
const families='white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const raw=[];
for(const file of scope){
 const text=fs.readFileSync(file,'utf8'),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const visit=n=>{
   // Document templates, card art and their editor overlays are output data.
   if(file.endsWith('/participants/chest-cards.tsx')&&ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['defaultTemplate','readTemplates','createQrUrl','FieldBox','ChestCard'].includes(d.name.getText(source))))return;
   if(ts.isCallExpression(n)&&['coreColor','coreAlpha'].includes(n.expression.getText(source)))return;
   if(ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.initializer&&ts.isStringLiteral(a.initializer)&&((a.name.text==='className'&&/\bprint-(only|page|sheet|card)\b/.test(a.initializer.text))||(a.name.text==='id'&&a.initializer.text==='print-evaluation-sheet'))))return;
   if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n)){
     const line=source.getLineAndCharacterOfPosition(n.getStart(source)).line+1;
     if(/^(#[\da-f]{3,8}|white|black|rgba?\([\d.,\s]+\))$/i.test(n.text))raw.push({file,line,value:n.text,parent:n.parent.kind===ts.SyntaxKind.PropertyAssignment?n.parent.name.getText(source):ts.SyntaxKind[n.parent.kind]});
     const matches=n.text.match(new RegExp(`(?<![\\w-])(?:bg|text|border|ring|from|via|to)-(?:${families})(?:-(?:50|100|200|300|400|500|600|700|800|900|950))?(?![\\w-])`,'g'));
     if(matches)raw.push({file,line,utilities:matches});
   }
   ts.forEachChild(n,visit);
 };visit(source);
}
if(process.argv.includes('--raw'))console.log(raw.map(x=>JSON.stringify(x)).join('\n'));
else {
 const actionable=raw.filter(x=>x.utilities||(['color','background','backgroundColor','border','borderColor','tintColor','placeholderTextColor','selectionColor'].includes(x.parent)));
 console.log(JSON.stringify({modules:scope.length,rawCandidates:raw.length,unresolvedUi:actionable},null,2));
 if(actionable.length)process.exitCode=1;
}
