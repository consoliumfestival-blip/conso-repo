type Environment = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

type PagesContext = {
  request: Request;
  env: Environment;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIST_EDGE_TTL_SECONDS = 5;
const PRESIGN_EDGE_TTL_SECONDS = 1200;
const RESOLUTION_PRIORITY = ['print', 'hd', 'standard', 'share', 'thumb'];

function json(body: unknown, status = 200, cacheStatus?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      ...(cacheStatus ? { 'X-Public-Media-Cache': cacheStatus } : {}),
    },
  });
}

function credentials(env: Environment) {
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^https:\/\//.test(url)) throw new Error('Public media source is unavailable');
  return { url: url.replace(/\/$/, ''), key };
}

async function supabaseRest<T>(env: Environment, path: string, body?: Record<string, unknown>): Promise<T> {
  const { url, key } = credentials(env);
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    signal: AbortSignal.timeout(8_000),
    headers: {
      apikey: key,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Public media source returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function resolveR2DownloadUrl(requestOrigin: string, env: Environment, objectKey: string): Promise<string | null> {
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const keyUrl = new URL('/_public-media-presign/v1', requestOrigin);
  keyUrl.searchParams.set('object_key', objectKey);
  const cacheReq = new Request(keyUrl.toString());

  const cached = await cache?.match(cacheReq).catch(() => undefined);
  if (cached) {
    const data = await cached.json().catch(() => null) as { url?: string } | null;
    if (data?.url) return data.url;
  }

  const { url, key } = credentials(env);
  const ext = objectKey.split('.').pop()?.toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const response = await fetch(`${url}/functions/v1/r2-presign`, {
    method: 'POST',
    signal: AbortSignal.timeout(8_000),
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ objectKey, contentType, operation: 'download' }),
  }).catch(() => null);

  if (!response || !response.ok) return null;
  const payload = await response.json().catch(() => null) as { publicUrl?: string | null; url?: string | null } | null;
  const resolved = (payload?.publicUrl && /^https:\/\//.test(payload.publicUrl))
    ? payload.publicUrl
    : (payload?.url && /^https:\/\//.test(payload.url) ? payload.url : null);

  if (resolved && cache) {
    await cache.put(cacheReq, new Response(JSON.stringify({ url: resolved }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${PRESIGN_EDGE_TTL_SECONDS}`,
      },
    })).catch(() => undefined);
  }
  return resolved;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

function pickBestResolution(resolutions: Record<string, { public_url?: string | null; storage_path?: string | null }>) {
  for (const res of RESOLUTION_PRIORITY) {
    const entry = resolutions[res];
    if (entry && (entry.public_url || entry.storage_path)) {
      return { resolution: res, ...entry };
    }
  }
  for (const [res, entry] of Object.entries(resolutions)) {
    if (entry && (entry.public_url || entry.storage_path)) {
      return { resolution: res, ...entry };
    }
  }
  return null;
}

async function resolvePublicMedia(requestOrigin: string, env: Environment, tenantId: string, requestedFestivalId: string | null) {
  const generatedAt = new Date().toISOString();
  const [rawFeatures, rawSettings] = await Promise.all([
    supabaseRest<any>(env, 'rpc/get_public_tenant_feature_settings', { p_tenant_id: tenantId }),
    supabaseRest<any[]>(env, 'rpc/get_public_leaderboard_settings', { p_tenant_id: tenantId, p_festival_id: requestedFestivalId }),
  ]);

  const publicPageEnabled = rawFeatures?.public_page === true;
  const mediaEnabled = publicPageEnabled && rawFeatures?.sections?.media === true;
  if (!mediaEnabled) {
    return {
      tenant_id: tenantId,
      festival_id: null,
      enabled: false,
      generated_at: generatedAt,
      items: [],
    };
  }

  const settingRow = Array.isArray(rawSettings) ? rawSettings[0] ?? null : null;
  const festivalId = requestedFestivalId
    ?? (typeof settingRow?.festival_id === 'string' && UUID.test(settingRow.festival_id) ? settingRow.festival_id : null)
    ?? await supabaseRest<string | null>(env, 'rpc/get_public_active_festival_id', { p_tenant_id: tenantId });

  if (!festivalId || typeof festivalId !== 'string' || !UUID.test(festivalId)) {
    return {
      tenant_id: tenantId,
      festival_id: null,
      enabled: true,
      generated_at: generatedAt,
      items: [],
    };
  }

  const joinedParams = new URLSearchParams({
    select: 'id,render_hash,event_name,resolution,public_url,storage_path,asset_type,is_current,visibility_status,created_at,item:items(item_name_en,item_name_ml,item_type,item_code),result:results(public_result_no,public_visible)',
    festival_id: `eq.${festivalId}`,
    order: 'created_at.desc',
    limit: '300',
  });
  let rows: any[];
  try {
    rows = await supabaseRest<any[]>(env, `generated_assets?${joinedParams}`);
  } catch {
    const basicParams = new URLSearchParams({
      select: 'id,render_hash,event_name,resolution,public_url,storage_path,asset_type,is_current,visibility_status,created_at',
      festival_id: `eq.${festivalId}`,
      order: 'created_at.desc',
      limit: '300',
    });
    rows = await supabaseRest<any[]>(env, `generated_assets?${basicParams}`);
  }

  if (!Array.isArray(rows)) throw new Error('Invalid generated_assets response');

  const grouped = new Map<string, {
    id: string;
    render_hash: string;
    title: string;
    subtitle: string;
    format: string;
    result_no: number | null;
    item_code: string;
    created_at: string;
    resolutions: Record<string, { public_url?: string | null; storage_path?: string | null }>;
  }>();

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    if (!row || typeof row !== 'object') continue;
    if (row.is_current === false) continue;
    if (row.visibility_status && row.visibility_status !== 'published') continue;
    if (row.result && row.result.public_visible === false) continue;

    const hashKey = (typeof row.render_hash === 'string' && row.render_hash.trim())
      ? row.render_hash.trim()
      : `_ungrouped_${row.id || idx}`;

    if (!grouped.has(hashKey)) {
      const title = String(row.event_name || row.item?.item_name_en || row.item?.item_name_ml || 'Result Poster').trim();
      const itemMl = String(row.item?.item_name_ml || '').trim();
      const subtitle = itemMl && itemMl !== title ? itemMl : '';
      const resultNo = row.result?.public_result_no != null && Number.isFinite(Number(row.result.public_result_no))
        ? Number(row.result.public_result_no)
        : null;
      const isManual = hashKey.startsWith('manual_') || (!row.item && resultNo === null);
      const format = isManual ? 'Media Upload' : 'Result Poster';

      grouped.set(hashKey, {
        id: String(row.id || hashKey),
        render_hash: hashKey,
        title,
        subtitle,
        format,
        result_no: resultNo,
        item_code: String(row.item?.item_code || ''),
        created_at: typeof row.created_at === 'string' ? row.created_at : generatedAt,
        resolutions: {},
      });
    }

    const entry = grouped.get(hashKey)!;
    const resKey = String(row.resolution || 'hd').toLowerCase();
    if (!entry.resolutions[resKey]) {
      entry.resolutions[resKey] = {
        public_url: typeof row.public_url === 'string' ? row.public_url : null,
        storage_path: typeof row.storage_path === 'string' ? row.storage_path : null,
      };
    }
  }

  const candidates = Array.from(grouped.values());
  const resolvedItems = await mapWithConcurrency(candidates, 8, async (item) => {
    const best = pickBestResolution(item.resolutions);
    if (!best) return null;

    let imageUrl: string | null = null;
    if (best.public_url && /^https:\/\//.test(best.public_url)) {
      imageUrl = best.public_url;
    } else {
      const objectKey = (best.public_url && best.public_url.startsWith('r2://'))
        ? best.public_url.slice(5)
        : (best.storage_path || '');
      if (objectKey) {
        imageUrl = await resolveR2DownloadUrl(requestOrigin, env, objectKey);
      }
    }

    if (!imageUrl) return null;
    return {
      id: item.id,
      render_hash: item.render_hash,
      title: item.title,
      subtitle: item.subtitle,
      format: item.format,
      result_no: item.result_no,
      item_code: item.item_code,
      resolution: best.resolution,
      image_url: imageUrl,
      download_url: imageUrl,
      created_at: item.created_at,
    };
  });

  return {
    tenant_id: tenantId,
    festival_id: festivalId,
    enabled: true,
    generated_at: generatedAt,
    items: resolvedItems.filter((item): item is NonNullable<typeof item> => item !== null),
  };
}

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  const requestUrl = new URL(request.url);
  const rawTenantId = requestUrl.searchParams.get('tenant_id');
  if (!rawTenantId || !UUID.test(rawTenantId)) {
    return json({ error: 'Valid tenant_id is required' }, 400);
  }
  const tenantId = rawTenantId.toLowerCase();

  const rawFestivalId = requestUrl.searchParams.get('festival_id');
  if (rawFestivalId && !UUID.test(rawFestivalId)) {
    return json({ error: 'Valid festival_id is required' }, 400);
  }
  const requestedFestivalId = rawFestivalId ? rawFestivalId.toLowerCase() : null;

  try {
    const cache = (globalThis as any).caches?.default as Cache | undefined;
    const listCacheUrl = new URL('/_public-media-list/v1', requestUrl.origin);
    listCacheUrl.searchParams.set('tenant_id', tenantId);
    if (requestedFestivalId) listCacheUrl.searchParams.set('festival_id', requestedFestivalId);
    const listCacheReq = new Request(listCacheUrl.toString());

    const cached = await cache?.match(listCacheReq).catch(() => undefined);
    if (cached) {
      return json(await cached.json(), 200, 'HIT');
    }

    const payload = await resolvePublicMedia(requestUrl.origin, env, tenantId, requestedFestivalId);
    if (cache) {
      await cache.put(listCacheReq, new Response(JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${LIST_EDGE_TTL_SECONDS}`,
        },
      })).catch(() => undefined);
    }
    return json(payload, 200, cache ? 'MISS' : 'BYPASS');
  } catch (error) {
    console.error('Public media read failed', error);
    return json({ error: 'Public media is temporarily unavailable' }, 503);
  }
}
