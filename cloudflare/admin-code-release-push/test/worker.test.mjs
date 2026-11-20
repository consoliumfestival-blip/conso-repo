import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { loadSubscriptions } from '../src/index.mjs';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('loads only opted-in Admin subscriptions with their owner and tenant scope', async () => {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);

    if (url.pathname.endsWith('/admin_web_push_subscriptions')) {
      return Response.json([
        { id: 'sub-1', user_id: 'admin-1', tenant_id: 'tenant-1', subscription: { endpoint: 'https://push.example/1' } },
        { id: 'sub-2', user_id: 'leader-1', tenant_id: 'tenant-1', subscription: { endpoint: 'https://push.example/2' } },
        { id: 'sub-3', user_id: 'admin-2', tenant_id: 'tenant-2', subscription: { endpoint: 'https://push.example/3' } },
      ]);
    }

    if (url.pathname.endsWith('/profiles')) {
      return Response.json([
        { id: 'admin-1', tenant_id: 'tenant-1', role: 'admin', is_superadmin: false, notification_enabled: true },
        { id: 'leader-1', tenant_id: 'tenant-1', role: 'team_leader', is_superadmin: false, notification_enabled: true },
        { id: 'admin-2', tenant_id: 'tenant-2', role: 'admin', is_superadmin: false, notification_enabled: false },
      ]);
    }

    throw new Error(`Unexpected request to ${url.pathname}`);
  };

  const result = await loadSubscriptions({
    SUPABASE_URL: 'https://project.example',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  });

  assert.deepEqual(result.map((row) => row.id), ['sub-1']);
  assert.ok(calls[0].searchParams.get('select').includes('user_id'));
  assert.ok(calls[0].searchParams.get('select').includes('tenant_id'));
  assert.ok(calls[1].searchParams.get('id').includes('admin-1'));
});
