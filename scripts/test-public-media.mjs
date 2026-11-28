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

test('paginates backend results lazily (limit=20), skips 404 R2 items cleanly, and serves immutable cached images (?img=1)', async () => {
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

  // 25 media items where index 2 (3rd item) points to a missing R2 object
  const rows = [];
  for (let i = 0; i < 25; i++) {
    const num = String(i + 1).padStart(2, '0');
    const isGone = i === 2;
    rows.push(
      {
        id: `media-hd-${num}`,
        render_hash: `manual_media_item_${num}`,
        event_name: `Stage Photo ${num}`,
        resolution: 'hd',
        public_url: isGone ? 'r2://festivals/f1/posters/gone-page.webp' : `https://cdn.example.com/media/p-${num}-hd.webp`,
        storage_path: isGone ? 'festivals/f1/posters/gone-page.webp' : null,
        is_current: true,
        visibility_status: 'published',
        created_at: `2026-11-28T03:${num}:00Z`,
      },
      {
        id: `media-th-${num}`,
        render_hash: `manual_media_item_${num}`,
        event_name: `Stage Photo ${num}`,
        resolution: 'thumb',
        public_url: isGone ? 'r2://festivals/f1/posters/gone-page.webp' : `https://cdn.example.com/media/p-${num}-th.webp`,
        storage_path: isGone ? 'festivals/f1/posters/gone-page.webp' : null,
        is_current: true,
        visibility_status: 'published',
        created_at: `2026-11-28T03:${num}:00Z`,
      },
    );
  }

  let presignCalls = 0;
  let imageUpstreamFetches = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const parsed = new URL(u);
    if (parsed.pathname.endsWith('/rpc/get_public_tenant_feature_settings')) {
      return new Response(JSON.stringify({ public_page: true, sections: { media: true } }), { status: 200 });
    }
    if (parsed.pathname.endsWith('/rpc/get_public_leaderboard_settings')) {
      return new Response(JSON.stringify([{ festival_id: festivalId, is_public_visible: true }]), { status: 200 });
    }
    if (parsed.pathname.endsWith('/generated_assets')) {
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (parsed.pathname.endsWith('/functions/v1/r2-presign')) {
      presignCalls++;
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ url: `https://missing-page.example.com/${body.objectKey}` }), { status: 200 });
    }
    if (parsed.hostname === 'missing-page.example.com') {
      return new Response('NoSuchKey', { status: 404 });
    }
    if (u === 'https://cdn.example.com/media/p-01-th.webp') {
      imageUpstreamFetches++;
      return new Response(new Uint8Array([82, 73, 70, 70]), {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      });
    }
    return new Response('Not found', { status: 404 });
  };

  try {
    // Page 1: limit=20&offset=0 -> skips 1 dropped R2 item and fills exact 20 valid items with next_offset=21
    const p1Res = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}&section=media&limit=20&offset=0`),
      env,
    });
    assert.equal(p1Res.status, 200);
    assert.equal(p1Res.headers.get('X-Public-Media-Dropped'), '1');
    const p1 = await p1Res.json();
    assert.equal(p1.items.length, 20);
    assert.equal(p1.pagination.limit, 20);
    assert.equal(p1.pagination.offset, 0);
    assert.equal(p1.pagination.has_more, true);
    assert.equal(p1.pagination.next_offset, 21);
    assert.equal(presignCalls, 1, 'Should only presign objects scanned for page 1');
    assert.ok(p1.items[0].cached_thumb_url.includes('img=1'));
    assert.ok(p1.items[0].cached_thumb_url.includes('variant=thumb'));
    assert.ok(p1.items[0].cached_image_url.includes('variant=hd'));

    // Page 2: limit=20&offset=21 -> returns remaining 4 items with zero overlap
    const p2Res = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}&section=media&limit=20&offset=21`),
      env,
    });
    assert.equal(p2Res.status, 200);
    const p2 = await p2Res.json();
    assert.equal(p2.items.length, 4);
    assert.equal(p2.pagination.has_more, false);
    assert.equal(p2.pagination.next_offset, null);
    const p1Keys = new Set(p1.items.map((x) => x.render_hash));
    assert.ok(p2.items.every((x) => !p1Keys.has(x.render_hash)));

    // Immutable cached image endpoint (?img=1&asset=...&variant=thumb)
    const imgPath = p1.items[0].cached_thumb_url;
    const imgFirst = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in${imgPath}`),
      env,
    });
    assert.equal(imgFirst.status, 200);
    assert.equal(imgFirst.headers.get('Content-Type'), 'image/webp');
    assert.equal(imgFirst.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
    const imgEtag = imgFirst.headers.get('ETag');
    assert.ok(imgEtag);
    assert.equal(imageUpstreamFetches, 1);

    // Repeat fetch hits caches.default with zero upstream fetch, and If-None-Match returns 304
    const imgCached = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in${imgPath}`),
      env,
    });
    assert.equal(imgCached.status, 200);
    assert.equal(imgCached.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
    assert.equal(imageUpstreamFetches, 1);

    const imgNotMod = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in${imgPath}`, {
        headers: { 'If-None-Match': imgEtag },
      }),
      env,
    });
    assert.equal(imgNotMod.status, 304);
    assert.equal(imgNotMod.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  } finally {
    globalThis.fetch = origFetch;
    globalThis.caches = origCaches;
  }
});

test('limits result posters to included leaderboard items when limit_public_results is enabled and invalidates cache on revision change', async () => {
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

  let currentRevision = 1;
  let limitEnabled = true;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith('/rpc/get_public_snapshot_revision')) {
      return new Response(JSON.stringify(currentRevision), { status: 200 });
    }
    if (parsed.pathname.endsWith('/rpc/get_public_tenant_feature_settings')) {
      return new Response(JSON.stringify({ public_page: true, sections: { media: true } }), { status: 200 });
    }
    if (parsed.pathname.endsWith('/rpc/get_public_leaderboard_settings')) {
      return new Response(JSON.stringify([{
        festival_id: festivalId,
        is_public_visible: true,
        ranking_mode: 'LIMITED',
        item_limit: 1,
        limit_public_results: limitEnabled,
      }]), { status: 200 });
    }
    if (parsed.pathname.endsWith('/rpc/get_public_published_results_scoped')) {
      return new Response(JSON.stringify(
        limitEnabled
          ? [{ result_id: 'res-1', item_id: 'item-1' }]
          : [{ result_id: 'res-1', item_id: 'item-1' }, { result_id: 'res-2', item_id: 'item-2' }],
      ), { status: 200 });
    }
    if (parsed.pathname.endsWith('/generated_assets')) {
      return new Response(JSON.stringify([
        {
          id: 'p-1',
          render_hash: 'poster_item_1',
          event_id: 'item-1',
          result_id: 'res-1',
          event_name: 'Included Item',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/p1.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-28T09:00:00Z',
        },
        {
          id: 'p-2',
          render_hash: 'poster_item_2',
          event_id: 'item-2',
          result_id: 'res-2',
          event_name: 'Preview Only Item',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/p2.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-28T09:05:00Z',
        },
        {
          id: 'm-1',
          render_hash: 'manual_media_gallery',
          event_name: 'Stage Inauguration',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/media/stage.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-28T09:10:00Z',
        },
      ]), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  try {
    const restrictedRes = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}`),
      env,
    });
    assert.equal(restrictedRes.status, 200);
    const restrictedBody = await restrictedRes.json();
    assert.deepEqual(
      restrictedBody.items.map((i) => i.render_hash),
      ['poster_item_1', 'manual_media_gallery'],
      'Excludes result poster outside leaderboard limit while keeping manual media',
    );

    // Toggle OFF + revision bump -> edge cache invalidates on new revision and serves p2 too
    limitEnabled = false;
    currentRevision = 2;
    for (const key of entries.keys()) {
      if (key.includes('/_public-media-version/')) entries.delete(key);
    }

    const unrestrictedRes = await onRequestGet({
      request: new Request(`https://consoulium.sabicofficial.in/api/public-media?tenant_id=${tenantId}`),
      env,
    });
    assert.equal(unrestrictedRes.status, 200);
    const unrestrictedBody = await unrestrictedRes.json();
    assert.deepEqual(
      unrestrictedBody.items.map((i) => i.render_hash),
      ['poster_item_1', 'poster_item_2', 'manual_media_gallery'],
    );
  } finally {
    globalThis.fetch = origFetch;
    globalThis.caches = origCaches;
  }
});

test('paginates allowed results in 500-row chunks when item_limit spans more than 1,000 rows', async () => {
  const origFetch = globalThis.fetch;
  const totalAllowed = 1100;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith('/rpc/get_public_snapshot_revision')) {
      return new Response(JSON.stringify(5), { status: 200 });
    }
    if (parsed.pathname.endsWith('/rpc/get_public_tenant_feature_settings')) {
      return new Response(JSON.stringify({ public_page: true, sections: { media: true } }), { status: 200 });
    }
    if (parsed.pathname.endsWith('/rpc/get_public_leaderboard_settings')) {
      return new Response(JSON.stringify([{
        festival_id: festivalId,
        is_public_visible: true,
        ranking_mode: 'LIMITED',
        item_limit: 80,
        limit_public_results: true,
      }]), { status: 200 });
    }
    if (parsed.pathname.endsWith('/rpc/get_public_published_results_scoped')) {
      const limit = Number(parsed.searchParams.get('limit') || '500');
      const offset = Number(parsed.searchParams.get('offset') || '0');
      assert.equal(limit, 500);
      const end = Math.min(offset + limit, totalAllowed);
      const slice = Array.from({ length: Math.max(0, end - offset) }, (_, idx) => {
        const n = offset + idx;
        return { result_id: `res-${n}`, item_id: n === 1099 ? 'item-old-1099' : `item-${n}` };
      });
      return new Response(JSON.stringify(slice), {
        status: 206,
        headers: { 'Content-Range': `${offset}-${end - 1}/${totalAllowed}` },
      });
    }
    if (parsed.pathname.endsWith('/generated_assets')) {
      return new Response(JSON.stringify([
        {
          id: 'p-old',
          render_hash: 'poster_old_item',
          event_id: 'item-old-1099',
          result_id: 'res-1099',
          event_name: 'Old Limited Item',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/old.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-27T08:00:00Z',
        },
        {
          id: 'p-excluded',
          render_hash: 'poster_excluded',
          event_id: 'item-outside',
          result_id: 'res-outside',
          event_name: 'Outside Limit Item',
          resolution: 'hd',
          public_url: 'https://cdn.example.com/posters/out.webp',
          is_current: true,
          visibility_status: 'published',
          created_at: '2026-11-28T10:00:00Z',
        },
      ]), { status: 200, headers: { 'Content-Range': '0-1/2' } });
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
    assert.deepEqual(
      body.items.map((i) => i.render_hash),
      ['poster_old_item'],
      'Preserves allowed result poster beyond row 1,000 via 500-row pagination',
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});
