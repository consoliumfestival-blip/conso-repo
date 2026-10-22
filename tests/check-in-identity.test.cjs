const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname,'../src/core/utils/checkInIdentity.ts'),'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: moduleObject.exports, module: moduleObject });
const { findParticipantQrEntry } = moduleObject.exports;
const group = { id:'group-registration', entry_kind:'general_team', participant_id:null, participants:{id:null,chest_number:'1000'} };
const child = { id:'solo-registration', entry_kind:'participant', participant_id:'child', participants:{id:'child',chest_number:'101'} };
test('empty QR cannot match null participant IDs',()=>assert.equal(findParticipantQrEntry([group,child],{}),undefined));
test('a group chest QR never checks in a group as a student',()=>assert.equal(findParticipantQrEntry([group,child],{chest:'1000'}),undefined));
test('a member student QR resolves only their solo entry',()=>assert.equal(findParticipantQrEntry([group,child],{pid:'child'}),child));
test('student chest cards still resolve after group rows',()=>assert.equal(findParticipantQrEntry([group,child],{chest:'101'}),child));
test('legacy group row with missing metadata and null ID cannot match a student QR',()=>assert.equal(findParticipantQrEntry([{participants:{id:null,chest_number:'1000'}}],{pid:'child'}),undefined));
