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

type ResolutionEntry = { public_url?: string | null; storage_path?: string | null };

type CatalogCandidate = {
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
  resolutions: Record<string, ResolutionEntry>;
};

type PublicMediaCatalog = {
  tenant_id: string;
  festival_id: string | null;
  enabled: boolean;
  generated_at: string;
  candidates: CatalogCandidate[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION_EDGE_TTL_SECONDS = 5;
const LIST_EDGE_TTL_SECONDS = 15;
const PRESIGN_EDGE_TTL_SECONDS = 1800;
const IMMUTABLE_IMAGE_TTL_SECONDS = 31536000;
const MAX_PAGE_LIMIT = 100;
const REST_CHUNK_SIZE = 500;
const REST_MAX_ROWS = 10_000;
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

function parseContentRangeTotal(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const slash = headerValue.lastIndexOf('/');
  if (slash < 0) return null;
  const totalPart = headerValue.slice(slash + 1).trim();
  return /^\d+$/.test(totalPart) ? Number(totalPart) : null;
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

async function supabaseRestPaged<T>(
  env: Environment,
  path: string,
  body?: Record<string, unknown>,
  pageSize = REST_CHUNK_SIZE,
  maxRows = REST_MAX_ROWS,
): Promise<T[]> {
  const { url, key } = credentials(env);
  const rows: T[] = [];
  let expectedTotal: number | null = null;

  for (let offset = 0; ; offset += pageSize) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`${url}/rest/v1/${path}${separator}limit=${pageSize}&offset=${offset}`, {
      method: body ? 'POST' : 'GET',
      signal: AbortSignal.timeout(8_000),
      headers: {
        apikey: key,
        Accept: 'application/json',
        Prefer: 'count=exact',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Public media source returned ${response.status}`);

    const total = parseContentRangeTotal(response.headers.get('Content-Range'));
    if (total !== null) expectedTotal = total;

    const page = await response.json() as unknown;
    if (!Array.isArray(page)) throw new Error('Invalid public media list response');
    rows.push(...(page as T[]));

    if (expectedTotal !== null) {
      if (rows.length >= expectedTotal) break;
      if (page.length === 0) throw new Error('Public media response truncated');
    } else if (page.length < pageSize) {
      break;
    }

    if (rows.length >= maxRows) {
      throw new Error('Public media exceeded maximum row guard');
    }
  }

  return rows;
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

    if (resolved) {
      // Lightweight 1-byte GET (GetObject SigV4 only signs GET, not HEAD) to avoid serving dead 404 R2 keys
      const probe = await fetch(resolved, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(5_000),
      }).catch(() => null);
      if (probe) {
        try { await probe.body?.cancel(); } catch {}
        if (probe.status === 404) {
          return null;
        }
      }
    }

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

function isImageAsset(sourceUrl: string, rawPath?: string | null): boolean {
  const probe = `${sourceUrl} ${rawPath || ''}`.toLowerCase();
  return !/\.(mp4|webm|mov|m4v|pdf)(\?|$|\s)/i.test(probe);
}

async function resolveEntryUrl(requestOrigin: string, env: Environment, entry: ResolutionEntry): Promise<string | null> {
  if (entry.public_url && /^https:\/\//.test(entry.public_url)) {
    return entry.public_url;
  }
  const objectKey = (entry.public_url && entry.public_url.startsWith('r2://'))
    ? entry.public_url.slice(5)
    : (entry.storage_path || '');
  return objectKey ? resolveR2DownloadUrl(requestOrigin, env, objectKey) : null;
}

async function loadPublicMediaCatalog(
  env: Environment,
  tenantId: string,
  requestedFestivalId: string | null,
): Promise<PublicMediaCatalog> {
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
      candidates: [],
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
      candidates: [],
    };
  }

  const joinedParams = new URLSearchParams({
    select: 'id,render_hash,event_id,result_id,event_name,resolution,public_url,storage_path,asset_type,is_current,visibility_status,created_at,item:items(item_name_en,item_name_ml,item_type,item_code),result:results(public_result_no,public_visible)',
    festival_id: `eq.${festivalId}`,
    order: 'created_at.desc,id.desc',
  });
  let rows: any[];
  try {
    rows = await supabaseRestPaged<any>(env, `generated_assets?${joinedParams}`);
  } catch {
    const basicParams = new URLSearchParams({
      select: 'id,render_hash,event_id,result_id,event_name,resolution,public_url,storage_path,asset_type,is_current,visibility_status,created_at',
      festival_id: `eq.${festivalId}`,
      order: 'created_at.desc,id.desc',
    });
    rows = await supabaseRestPaged<any>(env, `generated_assets?${basicParams}`);
  }

  if (!Array.isArray(rows)) throw new Error('Invalid generated_assets response');

  const enforceResultLimit =
    settingRow?.limit_public_results === true &&
    settingRow?.ranking_mode === 'LIMITED' &&
    Number(settingRow?.item_limit) > 0;
  let allowedResultItemIds: Record<string, true> | null = null;
  let allowedResultIds: Record<string, true> | null = null;
  if (enforceResultLimit) {
    const allowedResults = await supabaseRestPaged<any>(env, 'rpc/get_public_published_results_scoped', {
      p_tenant_id: tenantId,
      p_festival_id: festivalId,
      p_include_participant_details: false,
    });
    allowedResultItemIds = {};
    allowedResultIds = {};
    for (const r of (Array.isArray(allowedResults) ? allowedResults : [])) {
      if (typeof r?.item_id === 'string' && r.item_id) allowedResultItemIds[r.item_id] = true;
      if (typeof r?.result_id === 'string' && r.result_id) allowedResultIds[r.result_id] = true;
    }
  }

  const grouped = new Map<string, CatalogCandidate>();

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

    const eventId = typeof row.event_id === 'string' && row.event_id ? row.event_id : null;
    const resultId = typeof row.result_id === 'string' && row.result_id ? row.result_id : null;
    const resultNo = row.result?.public_result_no != null && Number.isFinite(Number(row.result.public_result_no))
      ? Number(row.result.public_result_no)
      : null;
    const isManualMedia = hashKey.startsWith('manual_media_');
    const isManualResult = hashKey.startsWith('manual_result_');
    const hasResultLink = Boolean(eventId || resultId || row.item || resultNo !== null);
    const section: 'media' | 'result' = isManualMedia
      ? 'media'
      : (isManualResult || hasResultLink ? 'result' : 'media');

    if (enforceResultLimit && section === 'result') {
      const matchesItem = Boolean(eventId && allowedResultItemIds && Object.prototype.hasOwnProperty.call(allowedResultItemIds, eventId));
      const matchesResult = Boolean(resultId && allowedResultIds && Object.prototype.hasOwnProperty.call(allowedResultIds, resultId));
      if (!matchesItem && !matchesResult) continue;
    }

    if (!grouped.has(hashKey)) {
      const title = String(row.event_name || row.item?.item_name_en || row.item?.item_name_ml || 'Result Poster').trim();
      const itemMl = String(row.item?.item_name_ml || '').trim();
      const subtitle = itemMl && itemMl !== title ? itemMl : '';
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

  return {
    tenant_id: tenantId,
    festival_id: festivalId,
    enabled: true,
    generated_at: generatedAt,
    candidates: Array.from(grouped.values()),
  };
}

async function resolveCandidateItem(
  requestOrigin: string,
  env: Environment,
  tenantId: string,
  requestedFestivalId: string | null,
  item: CatalogCandidate,
) {
  const best = pickBestResolution(item.resolutions);
  if (!best) return null;

  const imageUrl = await resolveEntryUrl(requestOrigin, env, best);
  if (!imageUrl) return null;

  const useCfTransform = env.CF_IMAGE_RESIZING === 'true';
  let thumbUrl = imageUrl;
  const thumbEntry = item.resolutions.thumb;
  if (thumbEntry && best.resolution !== 'thumb' && (thumbEntry.public_url || thumbEntry.storage_path)) {
    thumbUrl = (await resolveEntryUrl(requestOrigin, env, thumbEntry)) || imageUrl;
  } else if (useCfTransform && /^https:\/\//.test(imageUrl)) {
    thumbUrl = `${requestOrigin}/cdn-cgi/image/format=auto,quality=86,fit=scale-down,width=640/${imageUrl}`;
  }

  const assetKey = item.render_hash || item.id;
  const dlParams = new URLSearchParams({ tenant_id: tenantId, download: '1', asset: assetKey });
  if (requestedFestivalId) dlParams.set('festival_id', requestedFestivalId);

  let cachedImageUrl: string | undefined;
  let cachedThumbUrl: string | undefined;
  if (isImageAsset(imageUrl, best.storage_path || best.public_url)) {
    const hdImgParams = new URLSearchParams({ tenant_id: tenantId, img: '1', asset: assetKey, variant: 'hd' });
    const thumbImgParams = new URLSearchParams({ tenant_id: tenantId, img: '1', asset: assetKey, variant: 'thumb' });
    if (requestedFestivalId) {
      hdImgParams.set('festival_id', requestedFestivalId);
      thumbImgParams.set('festival_id', requestedFestivalId);
    }
    cachedImageUrl = `/api/public-media?${hdImgParams}`;
    cachedThumbUrl = `/api/public-media?${thumbImgParams}`;
  }

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
    ...(cachedImageUrl ? { cached_image_url: cachedImageUrl } : {}),
    ...(cachedThumbUrl ? { cached_thumb_url: cachedThumbUrl } : {}),
    download_url: imageUrl,
    original_download_path: `/api/public-media?${dlParams}`,
    created_at: item.created_at,
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

async function loadMediaRevision(env: Environment, tenantId: string): Promise<string | null> {
  try {
    const raw = await supabaseRest<number | string | null>(env, 'rpc/get_public_snapshot_revision', {
      p_tenant_id: tenantId,
    });
    if (raw === null) return null;
    const revision = String(raw);
    return /^(0|[1-9][0-9]*)$/.test(revision) ? revision : null;
  } catch {
    return null;
  }
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
    const getCatalogCacheReq = async () => {
      const versionUrl = new URL('/_public-media-version/v1', requestUrl.origin);
      versionUrl.searchParams.set('tenant_id', tenantId);
      const { value: revision } = await shared(
        new Request(versionUrl.toString()),
        VERSION_EDGE_TTL_SECONDS,
        () => loadMediaRevision(env, tenantId),
      );
      const catalogCacheUrl = new URL('/_public-media-catalog/v4', requestUrl.origin);
      catalogCacheUrl.searchParams.set('tenant_id', tenantId);
      if (requestedFestivalId) catalogCacheUrl.searchParams.set('festival_id', requestedFestivalId);
      if (revision !== null) catalogCacheUrl.searchParams.set('revision', revision);
      return new Request(catalogCacheUrl.toString());
    };

    // 1. Immutable image proxy for stable permanent browser caching across R2 presign rotations
    if (requestUrl.searchParams.get('img') === '1') {
      const assetParam = requestUrl.searchParams.get('asset')?.trim();
      if (!assetParam) return json({ error: 'Asset identifier is required' }, 400);
      const variant = requestUrl.searchParams.get('variant') === 'thumb' ? 'thumb' : 'hd';

      const cache = (globalThis as any).caches?.default as Cache | undefined;
      const imgCacheUrl = new URL('/_public-media-img/v1', requestUrl.origin);
      imgCacheUrl.searchParams.set('tenant_id', tenantId);
      if (requestedFestivalId) imgCacheUrl.searchParams.set('festival_id', requestedFestivalId);
      imgCacheUrl.searchParams.set('asset', assetParam);
      imgCacheUrl.searchParams.set('variant', variant);
      const imgCacheReq = new Request(imgCacheUrl.toString());

      const cachedImg = await cache?.match(imgCacheReq).catch(() => undefined);
      if (cachedImg) {
        const cachedEtag = cachedImg.headers.get('ETag') || `"img:${assetParam}:${variant}"`;
        if (matchesIfNoneMatch(request.headers.get('If-None-Match'), cachedEtag)) {
          return new Response(null, {
            status: 304,
            headers: {
              ETag: cachedEtag,
              'Cache-Control': `public, max-age=${IMMUTABLE_IMAGE_TTL_SECONDS}, immutable`,
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }
        return new Response(cachedImg.body, {
          status: 200,
          headers: {
            'Content-Type': cachedImg.headers.get('Content-Type') || 'image/webp',
            'Cache-Control': `public, max-age=${IMMUTABLE_IMAGE_TTL_SECONDS}, immutable`,
            ETag: cachedEtag,
            'X-Content-Type-Options': 'nosniff',
            ...(cachedImg.headers.get('Content-Length') ? { 'Content-Length': cachedImg.headers.get('Content-Length')! } : {}),
          },
        });
      }

      const { value: catalog } = await shared(
        await getCatalogCacheReq(),
        LIST_EDGE_TTL_SECONDS,
        () => loadPublicMediaCatalog(env, tenantId, requestedFestivalId),
      );
      if (!catalog.enabled) return json({ error: 'Media asset not found' }, 404);
      const match = catalog.candidates.find((item) => item.render_hash === assetParam || item.id === assetParam);
      if (!match) return json({ error: 'Media asset not found' }, 404);

      const imgEtag = `"img:${match.render_hash}:${variant}"`;
      if (matchesIfNoneMatch(request.headers.get('If-None-Match'), imgEtag)) {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: imgEtag,
            'Cache-Control': `public, max-age=${IMMUTABLE_IMAGE_TTL_SECONDS}, immutable`,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      let resolvedUrl: string | null = null;
      const thumbEntry = match.resolutions.thumb;
      if (variant === 'thumb' && thumbEntry && (thumbEntry.public_url || thumbEntry.storage_path)) {
        resolvedUrl = await resolveEntryUrl(requestUrl.origin, env, thumbEntry);
      }
      if (!resolvedUrl) {
        const best = pickBestResolution(match.resolutions);
        if (best) resolvedUrl = await resolveEntryUrl(requestUrl.origin, env, best);
      }
      if (!resolvedUrl) return json({ error: 'Media asset not found' }, 404);

      const upstream = await fetch(resolvedUrl, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!upstream) return json({ error: 'Media file is temporarily unavailable' }, 502);
      if (upstream.status === 404) return json({ error: 'Media asset not found' }, 404);
      if (!upstream.ok) return json({ error: 'Media file is temporarily unavailable' }, 502);

      const bodyBuf = await upstream.arrayBuffer();
      const contentType = upstream.headers.get('content-type') || 'image/webp';
      const imgResponse = new Response(bodyBuf, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(bodyBuf.byteLength),
          'Cache-Control': `public, max-age=${IMMUTABLE_IMAGE_TTL_SECONDS}, immutable`,
          ETag: imgEtag,
          'X-Content-Type-Options': 'nosniff',
        },
      });
      if (cache) {
        await cache.put(imgCacheReq, imgResponse.clone()).catch(() => undefined);
      }
      return imgResponse;
    }

    const { value: catalog, cacheStatus } = await shared(
      await getCatalogCacheReq(),
      LIST_EDGE_TTL_SECONDS,
      () => loadPublicMediaCatalog(env, tenantId, requestedFestivalId),
    );

    // 2. Attachment download for a single asset
    if (requestUrl.searchParams.get('download') === '1') {
      const assetParam = requestUrl.searchParams.get('asset')?.trim();
      if (!assetParam) return json({ error: 'Asset identifier is required' }, 400);
      if (!catalog.enabled) return json({ error: 'Media asset not found' }, 404);
      const match = catalog.candidates.find((item) => item.render_hash === assetParam || item.id === assetParam);
      const best = match ? pickBestResolution(match.resolutions) : null;
      const downloadUrl = best ? await resolveEntryUrl(requestUrl.origin, env, best) : null;
      if (!match || !downloadUrl) {
        return json({ error: 'Media asset not found' }, 404);
      }

      const upstream = await fetch(downloadUrl, { signal: AbortSignal.timeout(15_000) });
      if (!upstream.ok) {
        return json({ error: 'Media file is temporarily unavailable' }, 502);
      }
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const contentLength = upstream.headers.get('content-length');
      const ext = inferDownloadExtension(contentType, downloadUrl);
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

    // 3. Paginated or full list
    const rawLimit = requestUrl.searchParams.get('limit');
    const rawOffset = requestUrl.searchParams.get('offset');
    let limit: number | null = null;
    let offset = 0;
    if (rawLimit !== null) {
      const trimmed = rawLimit.trim();
      if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) {
        return json({ error: 'Valid limit is required' }, 400);
      }
      limit = Math.min(MAX_PAGE_LIMIT, Number(trimmed));
    }
    if (rawOffset !== null) {
      const trimmed = rawOffset.trim();
      if (!/^\d+$/.test(trimmed)) {
        return json({ error: 'Valid offset is required' }, 400);
      }
      offset = Number(trimmed);
    }

    const rawSection = requestUrl.searchParams.get('section')?.trim().toLowerCase();
    const sectionFilter = (rawSection === 'media' || rawSection === 'result') ? rawSection : null;
    const isPaginated = limit !== null;

    if (!catalog.enabled) {
      const disabledPayload = {
        tenant_id: catalog.tenant_id,
        festival_id: null,
        enabled: false,
        generated_at: catalog.generated_at,
        items: [],
        ...(isPaginated ? { pagination: { limit: limit!, offset, count: 0, total: 0, has_more: false, next_offset: null } } : {}),
      };
      const etag = buildMediaEtag(disabledPayload, `${sectionFilter || 'all'}:${isPaginated ? `${offset}:${limit}` : 'all'}`);
      return json(disabledPayload, 200, cacheStatus, etag);
    }

    const filteredCandidates = sectionFilter
      ? catalog.candidates.filter((item) => item.section === sectionFilter)
      : catalog.candidates;

    let droppedCount = 0;
    let items: NonNullable<Awaited<ReturnType<typeof resolveCandidateItem>>>[] = [];
    let pagination: { limit: number; offset: number; count: number; total: number; has_more: boolean; next_offset: number | null } | undefined;

    if (isPaginated && limit !== null) {
      let cursor = Math.min(offset, filteredCandidates.length);
      while (cursor < filteredCandidates.length && items.length < limit) {
        const remaining = limit - items.length;
        const batch = filteredCandidates.slice(cursor, cursor + remaining);
        cursor += batch.length;
        const batchResolved = await mapWithConcurrency(batch, 8, (item) =>
          resolveCandidateItem(requestUrl.origin, env, tenantId, requestedFestivalId, item),
        );
        for (const resolved of batchResolved) {
          if (resolved) items.push(resolved);
          else droppedCount++;
        }
      }
      const hasMore = cursor < filteredCandidates.length;
      const adjustedTotal = Math.max(items.length, filteredCandidates.length - droppedCount);
      pagination = {
        limit,
        offset,
        count: items.length,
        total: adjustedTotal,
        has_more: hasMore,
        next_offset: hasMore ? cursor : null,
      };
    } else {
      const resolvedAll = await mapWithConcurrency(filteredCandidates, 8, (item) =>
        resolveCandidateItem(requestUrl.origin, env, tenantId, requestedFestivalId, item),
      );
      for (const resolved of resolvedAll) {
        if (resolved) items.push(resolved);
        else droppedCount++;
      }
    }

    if (droppedCount > 0) {
      console.warn('Public media dropped unresolved assets', {
        tenantId,
        festivalId: catalog.festival_id,
        droppedCount,
      });
    }

    const responsePayload = {
      tenant_id: catalog.tenant_id,
      festival_id: catalog.festival_id,
      enabled: catalog.enabled,
      generated_at: catalog.generated_at,
      items,
      ...(pagination ? { pagination } : {}),
    };

    const etag = buildMediaEtag(responsePayload, `${sectionFilter || 'all'}:${isPaginated ? `${offset}:${limit}` : 'all'}`);
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
