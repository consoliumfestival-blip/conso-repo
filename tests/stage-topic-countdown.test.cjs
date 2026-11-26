const test = require('node:test');
const assert = require('node:assert/strict');
const { stageTopicSecondsRemaining } = require('../src/core/utils/stageTopicCountdown.ts');

test('countdown uses publication time and the server clock across refreshes', () => {
  const publishedAt = '2026-11-26T10:00:00.000Z';
  const publishedMs = Date.parse(publishedAt);
  assert.equal(stageTopicSecondsRemaining(publishedAt, 300, 0, publishedMs), 300);
  assert.equal(stageTopicSecondsRemaining(publishedAt, 300, 0, publishedMs + 125_000), 175);
  // A client clock 20 seconds behind the server still sees the correct time.
  assert.equal(stageTopicSecondsRemaining(publishedAt, 300, 20_000, publishedMs + 105_000), 175);
  assert.equal(stageTopicSecondsRemaining(publishedAt, 300, 0, publishedMs + 310_000), 0);
});
