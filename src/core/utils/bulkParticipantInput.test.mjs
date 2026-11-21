import test from 'node:test';
import assert from 'node:assert/strict';
import { parseParticipantNames } from './bulkParticipantInput.ts';

test('trims participant names and ignores blank lines', () => {
  assert.deepEqual(parseParticipantNames('  Asha  \n\n Binu\n'), ['Asha', 'Binu']);
});

test('requires at least one non-empty participant name', () => {
  assert.throws(() => parseParticipantNames(' \n\t '), /Enter at least one participant name/);
});

test('rejects repeated names in the same batch as duplicate input rows', () => {
  assert.throws(() => parseParticipantNames('Asha\n asha '), /Duplicate participant names/);
});
