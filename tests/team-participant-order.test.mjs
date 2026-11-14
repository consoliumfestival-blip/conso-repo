import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareParticipantsByChestNumber } from '../src/core/utils/teamParticipantOrder.ts';

test('team roster sorts chest numbers numerically and puts missing numbers last', () => {
  const rows = [
    { id: 'c', name: 'C', chest_number: null },
    { id: 'b', name: 'B', chest_number: '10' },
    { id: 'a', name: 'A', chest_number: '2' },
    { id: 'd', name: 'D', chest_number: '1' },
    { id: 'e', name: 'Aaron', chest_number: '2' },
    { id: 'f', name: 'F', chest_number: ' ' },
  ];
  assert.deepEqual([...rows].sort(compareParticipantsByChestNumber).map((row) => row.id), ['d', 'a', 'e', 'b', 'c', 'f']);
});
