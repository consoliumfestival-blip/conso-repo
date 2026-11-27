import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRankVariables, compareOfficialResultNumbers, fingerprintOfficialResults, getOfficialResultNumberLabel, resolveOfficialResultNumber } from '../resultGroupRules';
import { resolveTemplateVariables } from '../../Utils/resolver';

test('uses the stored official number instead of the group display order', () => {
  const result = resolveOfficialResultNumber([
    { public_result_no: 24 },
    { public_result_no: 24 },
  ]);

  assert.deepEqual(result, { value: '24', conflict: false });
});

test('keeps a missing official number blank without inventing a sequence', () => {
  assert.deepEqual(resolveOfficialResultNumber([
    { public_result_no: null },
    {},
  ]), { value: '', conflict: false });
});

test('reports conflicting stored numbers and returns no arbitrary number', () => {
  assert.deepEqual(resolveOfficialResultNumber([
    { public_result_no: 24 },
    { public_result_no: 25 },
  ]), { value: '', conflict: true });
});

test('flags zero or negative stored result numbers instead of displaying them as official', () => {
  assert.deepEqual(resolveOfficialResultNumber([{ public_result_no: 0 }]), { value: '', conflict: true });
  assert.deepEqual(resolveOfficialResultNumber([{ public_result_no: -1 }]), { value: '', conflict: true });
});

test('labels missing or conflicting public numbers instead of rendering a misleading blank number', () => {
  assert.equal(getOfficialResultNumberLabel({ value: '', conflict: false }, true), 'Official number missing');
  assert.equal(getOfficialResultNumberLabel({ value: '', conflict: true }, true), 'Conflicting official numbers');
  assert.equal(getOfficialResultNumberLabel({ value: '', conflict: false }, false), 'Not public; number assigned on publish');
});

test('sorts published competitions by their stored publication-order number, numerically', () => {
  assert.ok(compareOfficialResultNumbers({ value: '2', conflict: false }, { value: '10', conflict: false }) < 0);
  assert.ok(compareOfficialResultNumbers({ value: '24', conflict: false }, { value: '', conflict: false }) < 0);
  assert.ok(compareOfficialResultNumbers({ value: '', conflict: true }, { value: '', conflict: false }) === 0);
});

test('keeps a missing-number warning in Studio UI and exports an empty result-number token', () => {
  const officialNumber = resolveOfficialResultNumber([{ public_result_no: null }]);
  const label = getOfficialResultNumberLabel(officialNumber, false);
  assert.equal(resolveTemplateVariables('{result_no}', { result_no: officialNumber.value }), '');
  assert.notEqual(label, resolveTemplateVariables('{result_no}', { result_no: officialNumber.value }));
});

test('preserves positive-point tied winners and their organisation order while omitting zero-point participants', () => {
  const variables = buildRankVariables([
    { rank: 1, participant_name: 'Amina', organisation_name: 'North', grade: 'A', points_awarded: 1 },
    { rank: 1, participant_name: 'Bilal', organisation_name: 'South', grade: 'A', points_awarded: 1 },
    { rank: 2, participant_name: 'Chitra', organisation_name: 'East', grade: 'B', points_awarded: 0 },
  ]);

  assert.equal(variables.name_1, 'AMINA & BILAL');
  assert.equal(variables.unit_1, 'North & South');
  assert.equal(variables.points_1, '1');
  assert.equal(variables.name_2, '');
  assert.equal(variables.unit_2, '');
  assert.equal(variables.points_2, '');
  assert.equal(variables.name_3, '');
});

test('keeps every positive-point winner tied at an official rank', () => {
  const variables = buildRankVariables([
    { rank: 1, participant_name: 'Amina', organisation_name: 'North', points_awarded: 1 },
    { rank: 1, participant_name: 'Bilal', organisation_name: 'South', points_awarded: 1 },
    { rank: 1, participant_name: 'Chitra', organisation_name: 'East', points_awarded: 1 },
    { rank: 1, participant_name: 'Dev', organisation_name: 'West', points_awarded: 1 },
  ]);

  assert.equal(variables.name_1, 'AMINA & BILAL & CHITRA & DEV');
  assert.equal(variables.unit_1, 'North & South & East & West');
  assert.equal(variables.points_1, '1');
});

test('omits participants with missing, zero, or negative points and unranked results', () => {
  const variables = buildRankVariables([
    { rank: 1, participant_name: 'No score', points_awarded: 0 },
    { rank: 1, participant_name: 'Unknown score' },
    { rank: 1, participant_name: 'Invalid negative', points_awarded: -1 },
    { rank: null, participant_name: 'Unranked', points_awarded: 1 },
  ]);

  assert.equal(variables.name_1, '');
  assert.equal(variables.unit_1, '');
  assert.equal(variables.points_1, '');
});

test('official source fingerprint ignores query row order but changes when a result changes', () => {
  const first = {
    result_id: 'result-a',
    participant_id: 'participant-a',
    organisation_id: 'org-a',
    rank: 1,
    participant_name: 'POOJA',
    organisation_name: 'Unit A',
    grade: 'A',
    points_awarded: 5,
    public_result_no: 24,
    registration_id: 'registration-a',
  };
  const second = { ...first, result_id: 'result-b', participant_id: 'participant-b', participant_name: 'ANU' };
  const original = fingerprintOfficialResults([first, second]);
  assert.equal(original, fingerprintOfficialResults([second, first]));
  assert.notEqual(original, fingerprintOfficialResults([{ ...first, points_awarded: 4 }, second]));
});
