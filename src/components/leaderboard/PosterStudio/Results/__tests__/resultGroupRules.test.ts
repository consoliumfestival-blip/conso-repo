import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRankVariables, fingerprintOfficialResults, resolveOfficialResultNumber } from '../resultGroupRules';

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
