import test from 'node:test';
import assert from 'node:assert/strict';
import type { PosterDeliveryScope, PosterDesignSnapshot } from '../../Database/posterDesignSnapshot';
import { canAccessPosterSnapshot } from '../posterSnapshotAccess';

const snapshot = {
  userId: 'creator-a',
  tenantId: 'tenant-a',
  festivalId: 'festival-a',
} as PosterDesignSnapshot;

function scope(overrides: Partial<PosterDeliveryScope> = {}): PosterDeliveryScope {
  return { userId: 'creator-a', tenantId: 'tenant-a', festivalId: 'festival-a', ...overrides };
}

test('local pending designs are limited to their creating account', () => {
  assert.equal(canAccessPosterSnapshot(snapshot, scope(), 'owner_only'), true);
  assert.equal(canAccessPosterSnapshot(snapshot, scope({ userId: 'creator-b' }), 'owner_only'), false);
});

test('cloud generations can be reopened by an authorized admin in the same tenant and festival', () => {
  assert.equal(canAccessPosterSnapshot(snapshot, scope({ userId: 'admin-b' }), 'tenant_shared'), true);
  assert.equal(canAccessPosterSnapshot(snapshot, scope({ userId: 'admin-b', tenantId: 'tenant-b' }), 'tenant_shared'), false);
  assert.equal(canAccessPosterSnapshot(snapshot, scope({ userId: 'admin-b', festivalId: 'festival-b' }), 'tenant_shared'), false);
});
