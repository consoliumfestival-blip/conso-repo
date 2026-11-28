type Environment = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

type PagesContext = {
  request: Request;
  env: Environment;
};

type PublicFlags = {
  public_page: boolean;
  public_leaderboard: boolean;
  sections: { schedule: boolean; results: boolean; participant_results: boolean; media: boolean };
};

type PublicContext = {
  features: PublicFlags;
  settings: Record<string, unknown> | null;
  festivalId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION_EDGE_TTL_SECONDS = 5;
const REVISION_DATA_EDGE_TTL_SECONDS = 300;
const MAX_BROWSER_AGE_MS = 60_000;
const RPC_PAGE_SIZE = 500;
const RPC_MAX_ROWS = 10_000;
const pending = new Map<string, Promise<unknown>>();

function disabledFlags(): PublicFlags {
  return {
    public_page: false,
    public_leaderboard: false,
    sections: { schedule: false, results: false, participant_results: false, media: false },
  };
}

function normalizeFlags(raw: any): PublicFlags {
  if (!raw || raw.public_page !== true) return disabledFlags();
  return {
    public_page: true,
    public_leaderboard: raw.public_leaderboard === true,
    sections: {
      schedule: raw.sections?.schedule === true,
      results: raw.sections?.results === true,
      participant_results: raw.sections?.participant_results === true,
      media: raw.sections?.media === true,
    },
  };
}

function matchesIfNoneMatch(headerValue: string | null, etag: string): boolean {
  if (!headerValue) return false;
  const target = etag.trim();
  return headerValue.split(',').some((part) => {
    const token = part.trim();
    return token === '*' || token === target;
  });
}

function json(body: unknown, status = 200, cacheStatus?: string, etag?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      ...(cacheStatus ? { 'X-Public-Snapshot-Cache': cacheStatus } : {}),
      ...(etag ? { ETag: etag } : {}),
    },
  });
}

function credentials(env: Environment) {
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^https:\/\//.test(url)) throw new Error('Public data source is unavailable');
  return { url: url.replace(/\/$/, ''), key };
}

function parseContentRangeTotal(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const slash = headerValue.lastIndexOf('/');
  if (slash < 0) return null;
  const totalPart = headerValue.slice(slash + 1).trim();
  return /^\d+$/.test(totalPart) ? Number(totalPart) : null;
}

async function supabaseGet<T>(env: Environment, path: string, body?: Record<string, unknown>): Promise<T> {
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
  if (!response.ok) throw new Error(`Public data source returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function supabaseGetPaged<T>(
  env: Environment,
  path: string,
  body: Record<string, unknown>,
  pageSize = RPC_PAGE_SIZE,
  maxRows = RPC_MAX_ROWS,
): Promise<T[]> {
  const { url, key } = credentials(env);
  const rows: T[] = [];
  let expectedTotal: number | null = null;

  for (let offset = 0; ; offset += pageSize) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`${url}/rest/v1/${path}${separator}limit=${pageSize}&offset=${offset}`, {
      method: 'POST',
      signal: AbortSignal.timeout(8_000),
      headers: {
        apikey: key,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Prefer: 'count=exact',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Public data source returned ${response.status}`);

    const total = parseContentRangeTotal(response.headers.get('Content-Range'));
    if (total !== null) expectedTotal = total;

    const page = await response.json() as unknown;
    if (!Array.isArray(page)) throw new Error('Invalid public response');
    rows.push(...(page as T[]));

    if (expectedTotal !== null) {
      if (rows.length >= expectedTotal) break;
      if (page.length === 0) throw new Error('Public data response truncated');
    } else if (page.length < pageSize) {
      break;
    }

    if (rows.length >= maxRows) {
      throw new Error('Public data exceeded maximum row guard');
    }
  }

  return rows;
}

function cacheKey(requestUrl: URL, kind: 'context' | 'snapshot' | 'version', tenantId: string, festivalId?: string, revision?: string | null) {
  const url = new URL('/_public-cache/v1', requestUrl.origin);
  url.searchParams.set('kind', kind);
  url.searchParams.set('tenant_id', tenantId);
  if (festivalId) url.searchParams.set('festival_id', festivalId);
  if (revision !== undefined) url.searchParams.set('revision', revision ?? 'disabled');
  return new Request(url.toString());
}

async function loadVersion(env: Environment, tenantId: string): Promise<string | null> {
  const raw = await supabaseGet<number | string | null>(env, 'rpc/get_public_snapshot_revision', { p_tenant_id: tenantId });
  if (raw === null) return null;
  const revision = String(raw);
  if (!/^(0|[1-9][0-9]*)$/.test(revision)) throw new Error('Invalid public revision');
  return revision;
}

async function sharedVersion(requestUrl: URL, env: Environment, tenantId: string) {
  return shared(cacheKey(requestUrl, 'version', tenantId), () => loadVersion(env, tenantId), VERSION_EDGE_TTL_SECONDS);
}

async function shared<T>(key: Request, build: () => Promise<T>, ttlSeconds = VERSION_EDGE_TTL_SECONDS): Promise<{ value: T; cacheStatus: string }> {
  // Cache API is available in Pages Functions on both custom and pages.dev domains.
  // It is local to a Cloudflare data centre, so each location can fill independently.
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
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttlSeconds}` },
      })).catch(() => { console.warn('Public snapshot edge cache write failed'); });
    }
    return value;
  })();
  pending.set(flightKey, flight);
  try { return { value: await flight, cacheStatus: cache ? 'MISS' : 'BYPASS' }; }
  finally { pending.delete(flightKey); }
}

async function loadContext(env: Environment, tenantId: string): Promise<PublicContext> {
  const [rawFeatures, rawSettings] = await Promise.all([
    supabaseGet<any>(env, 'rpc/get_public_tenant_feature_settings', { p_tenant_id: tenantId }),
    supabaseGet<any[]>(env, 'rpc/get_public_leaderboard_settings', { p_tenant_id: tenantId, p_festival_id: null }),
  ]);
  const features = normalizeFlags(rawFeatures);
  const settings = Array.isArray(rawSettings) ? rawSettings[0] ?? null : null;
  if (!features.public_page) return { features, settings: null, festivalId: null };
  const visibleSettings = settings?.is_public_visible === true ? settings : null;
  const festivalId = visibleSettings?.festival_id ?? await supabaseGet<string | null>(
    env, 'rpc/get_public_active_festival_id', { p_tenant_id: tenantId },
  );
  if (festivalId !== null && (typeof festivalId !== 'string' || !UUID.test(festivalId))) {
    throw new Error('Invalid public festival');
  }
  return { features, settings: visibleSettings, festivalId };
}

async function itemCodes(env: Environment, tenantId: string, festivalId: string, rows: any[]): Promise<Record<string, string>> {
  const ids = [...new Set(rows.map((row) => row.item_id).filter((id) => typeof id === 'string' && UUID.test(id)))];
  const codes: Record<string, string> = {};
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    const params = new URLSearchParams({
      select: 'id,item_code',
      id: `in.(${chunk.join(',')})`,
      tenant_id: `eq.${tenantId}`,
      festival_id: `eq.${festivalId}`,
    });
    // The old public provider treats missing item codes as optional display data.
    const items = await supabaseGet<any[]>(env, `items?${params}`).catch(() => []);
    for (const item of items) codes[item.id] = item.item_code || '';
  }
  return codes;
}

function mappedResults(rows: any[], codes: Record<string, string>) {
  return rows.map((row) => ({
    ...row,
    item_category_codes: Array.isArray(row.item_category_codes) ? row.item_category_codes : [],
    rank: row.rank == null ? null : Number(row.rank),
    points_awarded: Number(row.points_awarded ?? 0),
    item_code: codes[row.item_id] || '',
  }));
}

function mappedSchedules(rows: any[]) {
  return rows.map((row) => ({
    ...row,
    id: row.schedule_id,
    venues: row.venue_id ? { id: row.venue_id, name: row.venue_name, location: row.venue_location } : null,
    items: {
      id: row.item_id,
      item_code: row.item_code,
      item_name_en: row.item_name,
      item_name_ml: row.item_name_ml,
      item_type: row.item_type,
      category_codes: row.item_category_codes || [],
    },
  }));
}

async function loadSnapshot(env: Environment, tenantId: string, festivalId: string, context: PublicContext, revision: string) {
  // Date the snapshot before any read, so a concurrent Hide cannot extend the
  // lifetime of data read earlier while other RPCs are still in flight.
  const generatedAt = new Date().toISOString();
  const { features, settings } = context;
  const showResults = features.public_page && features.sections.results && settings?.is_public_visible === true;
  const showLeaderboard = showResults && features.public_leaderboard;
  const showTeamRoster = features.public_page && features.public_leaderboard && features.sections.results;
  const [leaderboard, results, participantResults, schedules, teamRoster] = await Promise.all([
    showLeaderboard ? supabaseGet<any[]>(env, 'rpc/get_public_leaderboard_scoped', { p_tenant_id: tenantId, p_festival_id: festivalId }) : [],
    showResults ? supabaseGetPaged<any>(env, 'rpc/get_public_published_results_scoped', { p_tenant_id: tenantId, p_festival_id: festivalId, p_include_participant_details: true }) : [],
    showResults && features.sections.participant_results ? supabaseGetPaged<any>(env, 'rpc/get_public_participant_results_scoped', { p_tenant_id: tenantId, p_festival_id: festivalId }) : [],
    features.sections.schedule ? supabaseGetPaged<any>(env, 'rpc/get_public_schedules_scoped', { p_tenant_id: tenantId, p_festival_id: festivalId }) : [],
    showTeamRoster ? supabaseGet<any[]>(env, 'rpc/get_public_team_roster_scoped', { p_tenant_id: tenantId, p_festival_id: festivalId }) : [],
  ]);
  if (![leaderboard, results, participantResults, schedules, teamRoster].every(Array.isArray)) throw new Error('Invalid public response');
  const codes = await itemCodes(env, tenantId, festivalId, [...results, ...participantResults]);
  const rosterIds = new Set(teamRoster.map((row) => row.organisation_id));
  const publishedById = new Map(leaderboard.map((row) => [row.organisation_id, row]));
  const standings = [
    ...teamRoster.map((team) => ({
      ...team,
      total_points: 0, first_place_count: 0, second_place_count: 0, third_place_count: 0,
      grade_a_plus_count: 0, grade_a_count: 0, grade_b_count: 0, grade_c_count: 0,
      result_count: 0, grace_marks_awarded: 0,
      ...publishedById.get(team.organisation_id),
    })),
    ...leaderboard.filter((row) => !rosterIds.has(row.organisation_id)),
  ];
  return {
    tenant_id: tenantId,
    revision,
    festival_id: festivalId,
    generated_at: generatedAt,
    expires_at: new Date(Date.parse(generatedAt) + MAX_BROWSER_AGE_MS).toISOString(),
    features,
    settings,
    leaderboard: standings.map((row) => ({
      ...row,
      total_points: Number(row.total_points ?? 0),
      first_place_count: Number(row.first_place_count ?? 0),
      second_place_count: Number(row.second_place_count ?? 0),
      third_place_count: Number(row.third_place_count ?? 0),
      grade_a_plus_count: Number(row.grade_a_plus_count ?? 0),
      grade_a_count: Number(row.grade_a_count ?? 0),
      grade_b_count: Number(row.grade_b_count ?? 0),
      grade_c_count: Number(row.grade_c_count ?? 0),
      result_count: Number(row.result_count ?? 0),
      grace_marks_awarded: Number(row.grace_marks_awarded ?? 0),
    })),
    results: mappedResults(results, codes),
    participant_results: mappedResults(participantResults, codes),
    schedules: mappedSchedules(schedules),
  };
}

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  const requestUrl = new URL(request.url);
  const rawTenantId = requestUrl.searchParams.get('tenant_id');
  if (!rawTenantId || !UUID.test(rawTenantId)) return json({ error: 'Valid tenant_id is required' }, 400);
  const tenantId = rawTenantId.toLowerCase();
  try {
    const version = await sharedVersion(requestUrl, env, tenantId);
    const contextResult = await shared(
      cacheKey(requestUrl, 'context', tenantId, undefined, version.value),
      () => loadContext(env, tenantId),
      REVISION_DATA_EDGE_TTL_SECONDS,
    );
    const context = contextResult.value;
    const festivalId = context.festivalId;
    const etag = `W/"snap:${tenantId}:${festivalId || 'none'}:${version.value ?? 'disabled'}"`;
    if (!context.features.public_page || typeof festivalId !== 'string') {
      if (matchesIfNoneMatch(request.headers.get('If-None-Match'), etag)) {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: etag,
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
            'X-Public-Snapshot-Cache': contextResult.cacheStatus,
          },
        });
      }
      const generatedAt = new Date().toISOString();
      return json({
        tenant_id: tenantId, festival_id: null, generated_at: generatedAt,
        revision: version.value,
        expires_at: new Date(Date.parse(generatedAt) + MAX_BROWSER_AGE_MS).toISOString(),
        features: context.features, settings: null, leaderboard: [], results: [], participant_results: [], schedules: [],
      }, 200, contextResult.cacheStatus, etag);
    }
    const snapshot = await shared(
      cacheKey(requestUrl, 'snapshot', tenantId, festivalId, version.value),
      () => loadSnapshot(env, tenantId, festivalId, context, version.value ?? 'disabled'),
      REVISION_DATA_EDGE_TTL_SECONDS,
    );
    if (matchesIfNoneMatch(request.headers.get('If-None-Match'), etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
          'X-Public-Snapshot-Cache': snapshot.cacheStatus,
        },
      });
    }
    if (snapshot.cacheStatus === 'HIT') {
      const nowMs = Date.now();
      return json({
        ...snapshot.value,
        generated_at: new Date(nowMs).toISOString(),
        expires_at: new Date(nowMs + MAX_BROWSER_AGE_MS).toISOString(),
      }, 200, snapshot.cacheStatus, etag);
    }
    return json(snapshot.value, 200, snapshot.cacheStatus, etag);
  } catch (error) {
    console.error('Public snapshot read failed', error);
    // Never serve stale published data when the source or cache fails.
    return json({ error: 'Public data is temporarily unavailable' }, 503);
  }
}

export async function onRequestGetVersion({ request, env }: PagesContext): Promise<Response> {
  const requestUrl = new URL(request.url);
  const rawTenantId = requestUrl.searchParams.get('tenant_id');
  if (!rawTenantId || !UUID.test(rawTenantId)) return json({ error: 'Valid tenant_id is required' }, 400);
  const tenantId = rawTenantId.toLowerCase();
  try {
    const version = await sharedVersion(requestUrl, env, tenantId);
    return json({ tenant_id: tenantId, revision: version.value, checked_at: new Date().toISOString() }, 200, version.cacheStatus);
  } catch (error) {
    console.error('Public snapshot version read failed', error);
    return json({ error: 'Public data is temporarily unavailable' }, 503);
  }
}
