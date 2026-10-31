import assert from 'node:assert/strict';
import test from 'node:test';
import { categorySubstageDefault, chestNumberValue, substageForChest, supportsSubstages, validateSubstages } from '../src/core/utils/scheduleSubstages.ts';

const stages = [
  { id: 'first', name: 'Stage 1', ranges: [{ from: 10, to: 20 }, { from: 30, to: 40 }] },
  { id: 'second', name: 'Stage 2', ranges: [{ from: 50, to: 60 }] },
];

test('one stage may have several disjoint chest ranges, including gaps', () => {
  assert.equal(validateSubstages(stages), null);
  assert.equal(substageForChest(stages, '10')?.id, 'first');
  assert.equal(substageForChest(stages, '35')?.id, 'first');
  assert.equal(substageForChest(stages, '45'), null);
  assert.equal(substageForChest(stages, '55')?.id, 'second');
});

test('ranges cannot overlap within or across stages', () => {
  assert.match(validateSubstages([...stages, { id: 'third', name: 'Stage 3', ranges: [{ from: 40, to: 45 }] }]), /overlap/);
  assert.match(validateSubstages([{ id: 'first', name: 'Stage 1', ranges: [{ from: 10, to: 20 }, { from: 20, to: 30 }] }]), /overlap/);
});

test('only a complete numeric chest number can match a stage', () => {
  assert.equal(chestNumberValue('10A'), null);
  assert.equal(chestNumberValue(''), null);
  assert.equal(substageForChest(stages, '10A'), null);
});

test('new category individual schedules copy the latest category configuration', () => {
  const items = [
    { id: 'one', category_codes: ['PRIME'], participation_type: 'individual' },
    { id: 'two', category_codes: ['PRIME'], participation_type: 'individual' },
    { id: 'group', category_codes: ['PRIME'], participation_type: 'group' },
    { id: 'general', category_codes: ['GENERAL'], participation_type: 'individual' },
  ];
  const schedules = [
    { item_id: 'one', substage_config: stages, substage_config_updated_at: '2026-10-30T10:00:00Z' },
    { item_id: 'two', substage_config: [], substage_config_updated_at: '2026-10-31T10:00:00Z' },
  ];
  assert.deepEqual(categorySubstageDefault(schedules, items, items[0]), stages);
  assert.equal(supportsSubstages(items[2]), false);
  assert.equal(supportsSubstages(items[3]), false);
});
