/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const moduleObject = { exports: {} };
const source = fs.readFileSync(path.join(root, 'src/core/utils/teamScheduleParticipants.ts'), 'utf8');
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleObject, moduleObject.exports);
const { getTeamScheduleParticipantStatus, prepareTeamScheduleReport } = moduleObject.exports;

test('verification labels retain rejected/cancelled precedence and never cancel pending entries', () => {
  for (const [registration_status, is_verified, label] of [
    ['pending', false, 'Not Verified'], ['approved', true, 'Verified'], [null, null, 'Not Verified'],
    ['rejected', true, 'Rejected'], ['cancelled', true, 'Cancelled'], [' CANCELED ', false, 'Cancelled'],
  ]) assert.equal(getTeamScheduleParticipantStatus({ registration_status, is_verified }), label);
});

test('report keeps own-team group members and rejected rows while excluding other scopes', () => {
  const row = { participant_id: 'a', participant_name: 'A', organisation_id: 'team', item_id: 'item', registration_id: 'r', registration_status: 'rejected', is_verified: false, entry_kind: 'general_team' };
  const report = prepareTeamScheduleReport([row, { ...row, participant_id: 'b' }, { ...row, organisation_id: 'other' }, { ...row, item_id: 'other' }, { ...row, registration_id: null }], 'item', 'team');
  assert.deepEqual(report.participants.map(p => p.id), ['a', 'b']);
  assert.equal(report.assignments.length, 2);
  assert.equal(report.assignments[0].registration_status, 'rejected');
});

test('popup status labels match the actual shared PDF renderer', () => {
  const pdfSource = fs.readFileSync(path.join(root, 'src/services/participantExportService.ts'), 'utf8');
  const tables = [];
  class Doc {
    setFont() {} setFontSize() {} setTextColor() {} text() {} setPage() {} save() {}
    getNumberOfPages() { return 1; }
  }
  const pdfModule = { exports: {} };
  const requireStub = name => {
    if (name === 'jspdf') return { jsPDF: Doc };
    if (name === 'jspdf-autotable') return { default: (_doc, table) => tables.push(table) };
    if (name === 'react-native') return { Platform: { OS: 'web' } };
    return {};
  };
  new Function('require', 'module', 'exports', ts.transpileModule(pdfSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(requireStub, pdfModule, pdfModule.exports);
  const assignments = ['pending', 'approved', 'rejected', 'cancelled', 'canceled'].map((registration_status, i) => ({ participant_id: String(i), item_id: 'item', registration_status, is_verified: i !== 0, organisation_id: 'team' }));
  pdfModule.exports.downloadItemVerificationPdf({ item: { id: 'item' }, participants: assignments.map(a => ({ id: a.participant_id, name: a.participant_id })), assignments, sortBy: 'chest', teamId: 'team' });
  assert.deepEqual(tables[1].body.map(row => row[3]), assignments.map(getTeamScheduleParticipantStatus));
});

test('schedule RPC service fails closed for invalid or mismatched responses', async () => {
  let response;
  const calls = [];
  const serviceModule = { exports: {} };
  const serviceSource = fs.readFileSync(path.join(root, 'src/services/teamLeaderPortalService.ts'), 'utf8');
  new Function('require', 'module', 'exports', ts.transpileModule(serviceSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(() => ({ supabase: { rpc: async (...args) => { calls.push(args); return response; } } }), serviceModule, serviceModule.exports);
  const read = serviceModule.exports.teamLeaderPortalService.getScheduleParticipants;
  response = { data: { schedule_id: 'wrong', participants: [] } };
  await assert.rejects(read('schedule'), /Unable to read/);
  response = { error: new Error('permission denied') };
  await assert.rejects(read('schedule'), /permission denied/);
  response = { data: { schedule_id: 'schedule', item_id: 'item', checkin_complete: false, participants: [] } };
  assert.deepEqual(await read('schedule'), response.data);
  assert.deepEqual(calls[0], ['get_team_leader_schedule_participants', { p_schedule_id: 'schedule' }]);
});
