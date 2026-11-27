import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/public-media.ts';

const tenantId = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
const festivalId = '52f64db0-d58b-4237-b17c-f8b0b68f9597';
const env = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

test('returns published posters and manual uploads at highest clarity and resolves r2:// without auth', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith('/rpc/get_public_tenant_feature_settings')) {
      return new Response(JSON.stringify({ public_page: true, sections: { media: true } }), { status: 200 });
    }
    if (parsed.pathname.endsWith('/rpc/get_public_leaderboard_settings')) {
      return new Response(JSON.stringify([{ festival_id: festivalId, is_public_visible: true }]), { status: 200 });
    }
    if (parsed.pathname.endsWith('/generated_assets')) {
      return new Response(JSON.stringify([
        {
          id: 'a-share',
          render_hash: 'hash-1',
          event_name: 'Mappilappattu',
          resolution: 'share',
          public_url: 'r2://festivals/f1/posters/share.jpg',
          storage_path: 'festivals/f1/posters/share.jpg',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-27T10:00:00Z',
          item: { item_name_en: 'Mappilappattu', item_name_ml: 'മാപ്പിളപ്പാട്ട്', item_code: 'MP01' },
          result: { public_result_no: 7, public_visible: true },
        },
        {
          id: 'a-hd',
          render_hash: 'hash-1',
          event_name: 'Mappilappattu',
          resolution: 'hd',
          public_url: 'r2://festivals/f1/posters/hd.png',
          storage_path: 'festivals/f1/posters/hd.png',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-27T10:00:00Z',
          item: { item_name_en: 'Mappilappattu', item_name_ml: 'മാപ്പിളപ്പാട്ട്', item_code: 'MP01' },
          result: { public_result_no: 7, public_visible: true },
        },
        {
          id: 'a-manual',
          render_hash: 'manual_1234',
          event_name: 'Grand Opening Poster',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/manual.png',
          storage_path: 'festivals/f1/posters/manual.png',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-27T11:00:00Z',
        },
        {
          id: 'a-hidden',
          render_hash: 'hash-hidden',
          event_name: 'Draft Poster',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/draft.png',
          is_current: true,
          visibility_status: 'draft',
          created_at: '2026-11-27T12:00:00Z',
        },
        {
          id: 'a-hidden-result',
          render_hash: 'hash-hidden-res',
          event_name: 'Unpublished Result',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/hidden.png',
          is_current: true,
          visibility_status: 'published',
          result: { public_result_no: 9, public_visible: false },
          created_at: '2026-11-27T12:00:00Z',
        },
      ]), { status: 200 });
    }
    if (parsed.pathname.endsWith('/functions/v1/r2-presign')) {
      assert.equal(init.headers?.Authorization, undefined, 'Must not require user Authorization');
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ url: `https://signed.example.com/${body.objectKey}` }), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  try {
    const res = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}`),
      env,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.enabled, true);
    assert.equal(body.items.length, 2);

    const poster1 = body.items.find((i) => i.render_hash === 'hash-1');
    assert.equal(poster1.resolution, 'hd');
    assert.equal(poster1.image_url, 'https://signed.example.com/festivals/f1/posters/hd.png');
    assert.equal(poster1.result_no, 7);
    assert.equal(poster1.format, 'Result Poster');

    const manual = body.items.find((i) => i.render_hash === 'manual_1234');
    assert.equal(manual.image_url, 'https://cdn.example.com/posters/manual.png');
    assert.equal(manual.format, 'Media Upload');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('returns enabled: false and empty items when media section is disabled', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith('/rpc/get_public_tenant_feature_settings')) {
      return new Response(JSON.stringify({ public_page: true, sections: { media: false } }), { status: 200 });
    }
    if (parsed.pathname.endsWith('/rpc/get_public_leaderboard_settings')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    throw new Error(`Unexpected call: ${parsed.pathname}`);
  };
  try {
    const res = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}`),
      env,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.enabled, false);
    assert.deepEqual(body.items, []);
  } finally {
    globalThis.fetch = origFetch;
  }
});
