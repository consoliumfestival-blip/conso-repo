type Environment = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  CF_IMAGE_RESIZING?: string;
};

type PagesContext = {
  request: Request;
  env: Environment;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIST_EDGE_TTL_SECONDS = 15;
const PRESIGN_EDGE_TTL_SECONDS = 1800;
const RESOLUTION_PRIORITY = ['original', 'print', 'hd', 'standard', 'share', 'thumb'];
const pending = new Map<string, Promise<unknown>>();

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
};

function hashText(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildMediaEtag(payload: {
  tenant_id: string;
  festival_id: string | null;
  enabled: boolean;
  items: Array<{ render_hash: string; resolution: string; created_at: string }>;
}, section = 'all'): string {
  let latestCreatedAt = '';
  const sigParts: string[] = [];
  for (const item of payload.items) {
    if (item.created_at && item.created_at > latestCreatedAt) latestCreatedAt = item.created_at;
    sigParts.push(`${item.render_hash}:${item.resolution}`);
  }
  const hashOfIds = hashText(sigParts.join('|'));
  return `W/"media:${section}:${payload.tenant_id}:${payload.festival_id || 'none'}:${payload.enabled ? 1 : 0}:${payload.items.length}:${latestCreatedAt}:${hashOfIds}"`;
}

function matchesIfNoneMatch(headerValue: string | null, etag: string): boolean {
  if (!headerValue) return false;
  const normalizedTarget = etag.trim();
  return headerValue.split(',').some((part) => {
    const token = part.trim();
    return token === '*' || token === normalizedTarget;
  });
}

function json(body: unknown, status = 200, cacheStatus?: string, etag?: string, droppedCount = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      ...(cacheStatus ? { 'X-Public-Media-Cache': cacheStatus } : {}),
      ...(etag ? { ETag: etag } : {}),
      ...(droppedCount > 0 ? { 'X-Public-Media-Dropped': String(droppedCount) } : {}),
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

async function shared<T>(key: Request, ttlSeconds: number, build: () => Promise<T>): Promise<{ value: T; cacheStatus: string }> {
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) return { value: await cached.json() as T, cacheStatus: 'HIT' };

  const flightKey = key.url;
  const existing = pending.get(flightKey);
  if (existing) return { value: await existing as T, cacheStatus: 'MISS' };

  const flight = (async () => {
    const value = await build();
    if (cache) {
      await cache.put(key, new Response(JSON.stringify(value), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${ttlSeconds}`,
        },
      })).catch(() => undefined);
    }
    return value;
  })();
  pending.set(flightKey, flight);
  try {
    return { value: await flight, cacheStatus: cache ? 'MISS' : 'BYPASS' };
  } finally {
    pending.delete(flightKey);
  }
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

  const flightKey = keyUrl.toString();
  const existing = pending.get(flightKey);
  if (existing) return existing as Promise<string | null>;

  const flight = (async () => {
    const { url, key } = credentials(env);
    const ext = objectKey.split('.').pop()?.toLowerCase();
    const contentType = ext === 'png'
      ? 'image/png'
      : ext === 'webp'
      ? 'image/webp'
      : ext === 'mp4'
      ? 'video/mp4'
      : ext === 'webm'
      ? 'video/webm'
      : ext === 'pdf'
      ? 'application/pdf'
      : 'image/jpeg';

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
  })();

  pending.set(flightKey, flight);
  try {
    return await flight;
  } finally {
    pending.delete(flightKey);
  }
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
    select: 'id,render_hash,event_id,result_id,event_name,resolution,public_url,storage_path,asset_type,is_current,visibility_status,created_at,item:items(item_name_en,item_name_ml,item_type,item_code),result:results(public_result_no,public_visible)',
    festival_id: `eq.${festivalId}`,
    order: 'created_at.desc',
    limit: '1000',
  });
  let rows: any[];
  try {
    rows = await supabaseRest<any[]>(env, `generated_assets?${joinedParams}`);
  } catch {
    const basicParams = new URLSearchParams({
      select: 'id,render_hash,event_id,result_id,event_name,resolution,public_url,storage_path,asset_type,is_current,visibility_status,created_at',
      festival_id: `eq.${festivalId}`,
      order: 'created_at.desc',
      limit: '1000',
    });
    rows = await supabaseRest<any[]>(env, `generated_assets?${basicParams}`);
  }

  if (!Array.isArray(rows)) throw new Error('Invalid generated_assets response');

  const grouped = new Map<string, {
    id: string;
    render_hash: string;
    section: 'media' | 'result';
    event_id: string | null;
    result_id: string | null;
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
    if (row.visibility_status === 'draft' || row.visibility_status === 'hidden') continue;
    if (row.visibility_status != null && row.visibility_status !== 'published') continue;
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
      const eventId = typeof row.event_id === 'string' && row.event_id ? row.event_id : null;
      const resultId = typeof row.result_id === 'string' && row.result_id ? row.result_id : null;
      const isManualMedia = hashKey.startsWith('manual_media_');
      const isManualResult = hashKey.startsWith('manual_result_');
      const hasResultLink = Boolean(eventId || resultId || row.item || resultNo !== null);
      const section: 'media' | 'result' = isManualMedia
        ? 'media'
        : (isManualResult || hasResultLink ? 'result' : 'media');
      const format = section === 'media' ? 'Media Upload' : 'Result Poster';

      grouped.set(hashKey, {
        id: String(row.id || hashKey),
        render_hash: hashKey,
        section,
        event_id: eventId,
        result_id: resultId,
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
    if (!entry.event_id && typeof row.event_id === 'string' && row.event_id) entry.event_id = row.event_id;
    if (!entry.result_id && typeof row.result_id === 'string' && row.result_id) entry.result_id = row.result_id;
    const resKey = String(row.resolution || 'hd').toLowerCase();
    if (!entry.resolutions[resKey]) {
      entry.resolutions[resKey] = {
        public_url: typeof row.public_url === 'string' ? row.public_url : null,
        storage_path: typeof row.storage_path === 'string' ? row.storage_path : null,
      };
    }
  }

  const resolveEntryUrl = async (entry: { public_url?: string | null; storage_path?: string | null }): Promise<string | null> => {
    if (entry.public_url && /^https:\/\//.test(entry.public_url)) {
      return entry.public_url;
    }
    const objectKey = (entry.public_url && entry.public_url.startsWith('r2://'))
      ? entry.public_url.slice(5)
      : (entry.storage_path || '');
    return objectKey ? resolveR2DownloadUrl(requestOrigin, env, objectKey) : null;
  };

  const candidates = Array.from(grouped.values());
  let droppedCount = 0;
  const useCfTransform = env.CF_IMAGE_RESIZING === 'true';
  const resolvedItems = await mapWithConcurrency(candidates, 8, async (item) => {
    const best = pickBestResolution(item.resolutions);
    if (!best) {
      droppedCount++;
      return null;
    }

    const imageUrl = await resolveEntryUrl(best);
    if (!imageUrl) {
      droppedCount++;
      return null;
    }

    let thumbUrl = imageUrl;
    const thumbEntry = item.resolutions.thumb;
    if (thumbEntry && best.resolution !== 'thumb' && (thumbEntry.public_url || thumbEntry.storage_path)) {
      thumbUrl = (await resolveEntryUrl(thumbEntry)) || imageUrl;
    } else if (useCfTransform && /^https:\/\//.test(imageUrl)) {
      thumbUrl = `${requestOrigin}/cdn-cgi/image/format=auto,quality=86,fit=scale-down,width=640/${imageUrl}`;
    }

    const dlParams = new URLSearchParams({ tenant_id: tenantId, download: '1', asset: item.render_hash || item.id });
    if (requestedFestivalId) dlParams.set('festival_id', requestedFestivalId);
    return {
      id: item.id,
      render_hash: item.render_hash,
      section: item.section,
      event_id: item.event_id,
      result_id: item.result_id,
      title: item.title,
      subtitle: item.subtitle,
      format: item.format,
      result_no: item.result_no,
      item_code: item.item_code,
      resolution: best.resolution,
      image_url: imageUrl,
      thumb_url: thumbUrl,
      download_url: imageUrl,
      original_download_path: `/api/public-media?${dlParams}`,
      created_at: item.created_at,
    };
  });

  if (droppedCount > 0) {
    console.warn('Public media dropped unresolved assets', { tenantId, festivalId, droppedCount });
  }

  return {
    tenant_id: tenantId,
    festival_id: festivalId,
    enabled: true,
    generated_at: generatedAt,
    dropped_count: droppedCount,
    items: resolvedItems.filter((item): item is NonNullable<typeof item> => item !== null),
  };
}

function inferDownloadExtension(contentType: string, sourceUrl: string): string {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (MIME_TO_EXT[mime]) return MIME_TO_EXT[mime];
  try {
    const pathname = new URL(sourceUrl).pathname;
    const m = /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|pdf)$/i.exec(pathname);
    if (m) return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  } catch {
    // ignore URL parse errors
  }
  return 'bin';
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
    const listCacheUrl = new URL('/_public-media-list/v2', requestUrl.origin);
    listCacheUrl.searchParams.set('tenant_id', tenantId);
    if (requestedFestivalId) listCacheUrl.searchParams.set('festival_id', requestedFestivalId);
    const listCacheReq = new Request(listCacheUrl.toString());

    const { value: payload, cacheStatus } = await shared(
      listCacheReq,
      LIST_EDGE_TTL_SECONDS,
      () => resolvePublicMedia(requestUrl.origin, env, tenantId, requestedFestivalId),
    );

    if (requestUrl.searchParams.get('download') === '1') {
      const assetParam = requestUrl.searchParams.get('asset')?.trim();
      if (!assetParam) return json({ error: 'Asset identifier is required' }, 400);
      if (!payload.enabled) return json({ error: 'Media asset not found' }, 404);
      const match = payload.items.find((item) => item.render_hash === assetParam || item.id === assetParam);
      if (!match || !match.download_url) {
        return json({ error: 'Media asset not found' }, 404);
      }

      const upstream = await fetch(match.download_url, { signal: AbortSignal.timeout(15_000) });
      if (!upstream.ok) {
        return json({ error: 'Media file is temporarily unavailable' }, 502);
      }
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const contentLength = upstream.headers.get('content-length');
      const ext = inferDownloadExtension(contentType, match.download_url);
      const safeName = (match.title || 'poster').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'poster';
      return new Response(upstream.body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${safeName}.${ext}"`,
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
          'X-Content-Type-Options': 'nosniff',
          ...(contentLength ? { 'Content-Length': contentLength } : {}),
        },
      });
    }

    const rawSection = requestUrl.searchParams.get('section')?.trim().toLowerCase();
    const sectionFilter = (rawSection === 'media' || rawSection === 'result') ? rawSection : null;
    const droppedCount = Number((payload as { dropped_count?: number }).dropped_count || 0);
    const responsePayload = {
      tenant_id: payload.tenant_id,
      festival_id: payload.festival_id,
      enabled: payload.enabled,
      generated_at: payload.generated_at,
      items: sectionFilter
        ? payload.items.filter((item) => item.section === sectionFilter)
        : payload.items,
    };

    const etag = buildMediaEtag(responsePayload, sectionFilter || 'all');
    if (matchesIfNoneMatch(request.headers.get('If-None-Match'), etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
          'X-Public-Media-Cache': cacheStatus,
          ...(droppedCount > 0 ? { 'X-Public-Media-Dropped': String(droppedCount) } : {}),
        },
      });
    }

    return json(responsePayload, 200, cacheStatus, etag, droppedCount);
  } catch (error) {
    console.error('Public media read failed', error);
    return json({ error: 'Public media is temporarily unavailable' }, 503);
  }
}
