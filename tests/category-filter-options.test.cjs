const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getCategoryFilterOptions } = require('../src/core/utils/categoryFilterOptions.ts');

test('category filter options are derived from observed values without seeded categories', () => {
  assert.deepEqual(getCategoryFilterOptions(['e', 'CAMPUS', 'e', null]), ['All', 'CAMPUS', 'e']);
});

test('category filter options accept schedule category arrays and ignore empty values', () => {
  assert.deepEqual(getCategoryFilterOptions([['hss', 'GENERAL'], null, '  ']), ['All', 'GENERAL', 'hss']);
});
