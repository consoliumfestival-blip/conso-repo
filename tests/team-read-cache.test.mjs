import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { teamReadKey, isTeamAuthorizationError } from '../src/core/utils/teamReadCache.ts';
const base = { userId: 'user-a', tenantId: 'tenant', role: 'team_leader', assignmentId: 'assignment', parentTenantId: 'parent', festivalId: 'festival', festivalTeamId: 'team', organisationId: 'org' };

test('read caches are isolated by every authorization scope and resource', () => {
  const client = new QueryClient();
  const key = teamReadKey(base, 'schedule');
  client.setQueryData(key, ['original']);
  for (const field of Object.keys(base)) assert.equal(client.getQueryData(teamReadKey({ ...base, [field]: 'different' }, 'schedule')), undefined, field);
  assert.equal(client.getQueryData(teamReadKey(base, 'results')), undefined);
  assert.deepEqual(client.getQueryData(teamReadKey(base, 'schedule')), ['original']);
  client.removeQueries({ queryKey: ['team-read'] });
  assert.equal(client.getQueryData(key), undefined);
  client.clear();
});

test('network failure keeps existing data but authorization failures are distinguished', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = teamReadKey(base, 'schedule');
  client.setQueryData(key, ['last verified']);
  await assert.rejects(client.fetchQuery({ queryKey: key, queryFn: async () => { throw new Error('offline'); }, staleTime: 0 }));
  assert.deepEqual(client.getQueryData(key), ['last verified']);
  assert.equal(isTeamAuthorizationError({ code: '42501' }), true);
  assert.equal(isTeamAuthorizationError({ status: 401 }), true);
  assert.equal(isTeamAuthorizationError(new Error('offline')), false);
  client.clear();
});


test('cached screen data remains visible while a forced background refresh runs', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = teamReadKey(base, 'schedule');
  client.setQueryData(key, ['old schedule']);
  let resolveFetch;
  const observer = new QueryObserver(client, { queryKey: key, queryFn: () => new Promise(resolve => { resolveFetch = resolve; }), staleTime: 30_000 });
  const unsubscribe = observer.subscribe(() => {});
  assert.deepEqual(observer.getCurrentResult().data, ['old schedule']);
  const refresh = observer.refetch();
  assert.equal(observer.getCurrentResult().isFetching, true);
  assert.deepEqual(observer.getCurrentResult().data, ['old schedule']);
  resolveFetch(['new schedule']);
  await refresh;
  assert.deepEqual(observer.getCurrentResult().data, ['new schedule']);
  unsubscribe(); client.clear();
});

test('fresh reads deduplicate and a scoped invalidation refetches data', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = teamReadKey(base, 'schedule');
  let calls = 0;
  const options = { queryKey: key, queryFn: async () => [++calls], staleTime: 30_000 };
  assert.deepEqual(await client.fetchQuery(options), [1]);
  assert.deepEqual(await client.fetchQuery(options), [1]);
  assert.equal(calls, 1);
  await client.invalidateQueries({ queryKey: ['team-read'], refetchType: 'none' });
  assert.deepEqual(await client.fetchQuery(options), [2]);
  client.clear();
});
