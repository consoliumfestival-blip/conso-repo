const CAMPUS_TENANT_ID = '73ee92f3-d795-43eb-997e-380e52856424';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = {
  request: Request;
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  };
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get('tenant_id')?.toLowerCase();
  const festivalId = params.get('festival_id')?.toLowerCase();
  if (tenantId !== CAMPUS_TENANT_ID || !festivalId || !UUID.test(festivalId)) {
    return json({ error: 'Valid Campus tenant and festival are required' }, 400);
  }

  const url = env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !/^https:\/\//.test(url) || !key) {
    return json({ error: 'Campus standings are temporarily unavailable' }, 503);
  }

  try {
    const featuresResponse = await fetch(`${url}/rest/v1/rpc/get_public_tenant_feature_settings`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { apikey: key, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_tenant_id: tenantId }),
    });
    if (!featuresResponse.ok) throw new Error(`Campus features returned ${featuresResponse.status}`);
    const features = await featuresResponse.json();
    if (features?.public_page !== true || features?.public_leaderboard !== true || features?.sections?.results !== true) {
      return json({ tenant_id: tenantId, festival_id: festivalId, rows: [] });
    }
    // The public RPC validates that the festival belongs to this tenant and
    // returns rows only while the category mode and public visibility allow it.
    const response = await fetch(`${url}/rest/v1/rpc/get_public_category_trophy_standings`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { apikey: key, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_tenant_id: tenantId, p_festival_id: festivalId }),
    });
    if (!response.ok) throw new Error(`Category standings returned ${response.status}`);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid category standings response');
    return json({ tenant_id: tenantId, festival_id: festivalId, rows });
  } catch (error) {
    console.error('Campus category standings read failed', error);
    return json({ error: 'Campus standings are temporarily unavailable' }, 503);
  }
}
