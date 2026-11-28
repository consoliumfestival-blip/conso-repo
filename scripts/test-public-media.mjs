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
    if (parsed.hostname === 'signed.example.com') {
      assert.equal(init.method, 'GET');
      assert.equal(init.headers?.Range, 'bytes=0-0');
      return new Response(new Uint8Array([1]), { status: 206 });
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

test('prioritizes original clarity over compressed previews, streams attachment downloads, supports 304 ETag, and coalesces concurrent requests', async () => {
  const entries = new Map();
  const origCaches = globalThis.caches;
  globalThis.caches = {
    default: {
      async match(req) {
        const entry = entries.get(req.url);
        return entry && Date.now() < entry.expires ? entry.response.clone() : undefined;
      },
      async put(req, res) {
        const age = Number(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') ?? '')?.[1] ?? 0);
        entries.set(req.url, { response: res.clone(), expires: Date.now() + age * 1000 });
      },
    },
  };

  let assetQueries = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const parsed = new URL(u);
    if (parsed.pathname.endsWith('/rpc/get_public_tenant_feature_settings')) {
      return new Response(JSON.stringify({ public_page: true, sections: { media: true } }), { status: 200 });
    }
    if (parsed.pathname.endsWith('/rpc/get_public_leaderboard_settings')) {
      return new Response(JSON.stringify([{ festival_id: festivalId, is_public_visible: true }]), { status: 200 });
    }
    if (parsed.pathname.endsWith('/generated_assets')) {
      assetQueries++;
      await new Promise((r) => setTimeout(r, 15));
      return new Response(JSON.stringify([
        {
          id: 'thumb-1',
          render_hash: 'poster-orig',
          event_name: 'Highlight Reel & Poster',
          resolution: 'thumb',
          public_url: 'https://cdn.example.com/posters/thumb.jpg',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-27T10:00:00Z',
        },
        {
          id: 'orig-1',
          render_hash: 'poster-orig',
          event_name: 'Highlight Reel & Poster',
          resolution: 'original',
          public_url: 'https://cdn.example.com/posters/original-master.png',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-27T10:00:00Z',
        },
        {
          id: 'vid-1',
          render_hash: 'video-master',
          event_name: 'Closing Ceremony Promo',
          resolution: 'original',
          public_url: 'https://cdn.example.com/videos/promo.mp4',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-27T11:00:00Z',
        },
      ]), { status: 200 });
    }
    if (u === 'https://cdn.example.com/posters/original-master.png') {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Content-Length': '4' },
      });
    }
    if (u === 'https://cdn.example.com/videos/promo.mp4') {
      return new Response(new Uint8Array([0, 0, 0, 24]), {
        status: 200,
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
      });
    }
    return new Response('Not found', { status: 404 });
  };

  try {
    // Fire 5 concurrent requests before cache warms -> should coalesce into 1 generated_assets DB query
    const burst = await Promise.all(Array.from({ length: 5 }, () => onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}`),
      env,
    })));
    assert.equal(assetQueries, 1);
    const first = burst[0];
    assert.equal(first.status, 200);
    const etag = first.headers.get('ETag');
    assert.ok(etag && etag.startsWith('W/"media:'));
    const body = await first.json();
    const imgItem = body.items.find((i) => i.render_hash === 'poster-orig');
    assert.equal(imgItem.resolution, 'original');
    assert.equal(imgItem.image_url, 'https://cdn.example.com/posters/original-master.png');
    assert.ok(imgItem.original_download_path.includes('download=1'));

    // Conditional repeat visit with ETag -> 304 Not Modified without querying Supabase again
    const notMod = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}`, {
        headers: { 'If-None-Match': etag },
      }),
      env,
    });
    assert.equal(notMod.status, 304);
    assert.equal(assetQueries, 1);

    // Original PNG download attachment
    const pngDl = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in${imgItem.original_download_path}`),
      env,
    });
    assert.equal(pngDl.status, 200);
    assert.equal(pngDl.headers.get('Content-Type'), 'image/png');
    assert.match(pngDl.headers.get('Content-Disposition') || '', /^attachment; filename=".*\.png"$/);

    // Original MP4 video download attachment
    const vidDl = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}&download=1&asset=video-master`),
      env,
    });
    assert.equal(vidDl.status, 200);
    assert.equal(vidDl.headers.get('Content-Type'), 'video/mp4');
    assert.match(vidDl.headers.get('Content-Disposition') || '', /^attachment; filename="Closing_Ceremony_Promo\.mp4"$/);

    // Unknown or unpublished asset cannot be downloaded -> 404
    const missingDl = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}&download=1&asset=hidden-or-other-tenant`),
      env,
    });
    assert.equal(missingDl.status, 404);
  } finally {
    globalThis.fetch = origFetch;
    globalThis.caches = origCaches;
  }
});

test('separates media and result sections cleanly and exposes fast thumb_url alongside original download', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
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
          id: 'studio-1',
          render_hash: 'studio-res-1',
          event_id: 'item-111',
          result_id: 'res-111',
          event_name: 'Arabic Song',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/arabic-song.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-28T00:10:00Z',
        },
        {
          id: 'manual-res-1',
          render_hash: 'manual_result_999',
          event_id: 'item-222',
          result_id: 'res-222',
          event_name: 'Mapilappattu Result',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/mapila.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-28T00:12:00Z',
        },
        {
          id: 'media-thumb-1',
          render_hash: 'manual_media_777',
          event_name: 'Stage Crowd Photo',
          resolution: 'thumb',
          public_url: 'https://cdn.example.com/media/crowd-thumb.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-28T00:15:00Z',
        },
        {
          id: 'media-hd-1',
          render_hash: 'manual_media_777',
          event_name: 'Stage Crowd Photo',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/media/crowd-hd.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-28T00:15:00Z',
        },
      ]), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  try {
    const mediaRes = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}&section=media`),
      env,
    });
    assert.equal(mediaRes.status, 200);
    const mediaBody = await mediaRes.json();
    assert.equal(mediaBody.items.length, 1);
    assert.equal(mediaBody.items[0].render_hash, 'manual_media_777');
    assert.equal(mediaBody.items[0].section, 'media');
    assert.equal(mediaBody.items[0].thumb_url, 'https://cdn.example.com/media/crowd-thumb.webp');
    assert.equal(mediaBody.items[0].image_url, 'https://cdn.example.com/media/crowd-hd.webp');

    const resultRes = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}&section=result`),
      env,
    });
    assert.equal(resultRes.status, 200);
    const resultBody = await resultRes.json();
    assert.equal(resultBody.items.length, 2);
    assert.ok(resultBody.items.every((item) => item.section === 'result'));
    const studioItem = resultBody.items.find((i) => i.render_hash === 'studio-res-1');
    assert.equal(studioItem.event_id, 'item-111');
    assert.equal(studioItem.result_id, 'res-111');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('emits X-Public-Media-Dropped when presign fails, applies optional CF resizing when enabled, and preserves null visibility rows', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
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
          id: 'legacy-null-vis',
          render_hash: 'manual_media_legacy',
          event_name: 'Legacy Stage Shot',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/legacy.webp',
          is_current: null,
          visibility_status: null,
          created_at: '2026-11-28T01:00:00Z',
        },
        {
          id: 'hidden-explicit',
          render_hash: 'manual_media_hidden',
          event_name: 'Hidden Media',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/hidden.webp',
          is_current: true,
          visibility_status: 'hidden',
          created_at: '2026-11-28T01:05:00Z',
        },
        {
          id: 'unresolved-r2',
          render_hash: 'manual_media_bad_r2',
          event_name: 'Unresolved R2 Photo',
          resolution: 'hd',
          public_url: 'r2://festivals/f1/posters/bad.webp',
          storage_path: 'festivals/f1/posters/bad.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-28T01:10:00Z',
        },
      ]), { status: 200 });
    }
    if (parsed.pathname.endsWith('/functions/v1/r2-presign')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    return new Response('Not found', { status: 404 });
  };

  try {
    const res = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}&section=media`),
      env: { ...env, CF_IMAGE_RESIZING: 'true' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('X-Public-Media-Dropped'), '1');
    const body = await res.json();
    assert.equal(body.dropped_count, undefined);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].render_hash, 'manual_media_legacy');
    assert.equal(
      body.items[0].thumb_url,
      'https://consoulium.sabicofficial.in/cdn-cgi/image/format=auto,quality=86,fit=scale-down,width=640/https://cdn.example.com/posters/legacy.webp',
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('drops R2 assets whose presigned URL returns 404 NoSuchKey and reports X-Public-Media-Dropped', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
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
          id: 'missing-r2-row',
          render_hash: 'manual_media_gone_r2',
          event_name: 'Deleted Object Photo',
          resolution: 'hd',
          public_url: 'r2://festivals/f1/posters/gone.webp',
          storage_path: 'festivals/f1/posters/gone.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-28T02:00:00Z',
        },
      ]), { status: 200 });
    }
    if (parsed.pathname.endsWith('/functions/v1/r2-presign')) {
      const body = JSON.parse(String(initBodyFallback(url)));
      return new Response(JSON.stringify({ url: `https://missing.example.com/${body.objectKey || 'posters/gone.webp'}` }), { status: 200 });
    }
    if (parsed.hostname === 'missing.example.com') {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code></Error>', { status: 404 });
    }
    return new Response('Not found', { status: 404 });
  };

  function initBodyFallback() {
    return JSON.stringify({ objectKey: 'festivals/f1/posters/gone.webp' });
  }

  try {
    const res = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}&section=media`),
      env,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('X-Public-Media-Dropped'), '1');
    const body = await res.json();
    assert.deepEqual(body.items, []);
  } finally {
    globalThis.fetch = origFetch;
  }
});
