import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemResultIds } from '../src/core/utils/itemResultSelection.ts';

test('item actions include every loaded matching result and never another festival', () => {
  const results = [
    { result_id: 'a', item_id: 'item', festival_id: 'f1' },
    { result_id: 'b', item_id: 'item', festival_id: 'f1' },
    { result_id: 'c', item_id: 'item', festival_id: 'f2' },
    { result_id: 'd', item_id: 'other', festival_id: 'f1' },
    { result_id: 'e', item_id: null, festival_id: 'f1' },
  ];
  assert.deepEqual(itemResultIds(results, 'item', 'f1'), ['a', 'b']);
  assert.deepEqual(itemResultIds(results, 'result:e', 'f1'), ['e']);
  assert.deepEqual(itemResultIds(results, 'item', null), []);
});
