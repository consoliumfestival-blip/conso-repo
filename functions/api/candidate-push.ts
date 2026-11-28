type Environment = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

type PagesContext = {
  request: Request;
  env: Environment;
};

type SubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9-]{2,140}$/i;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, toArrayBuffer(data));
  return new Uint8Array(sig);
}

async function hkdfExtractAndExpand(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  const t1 = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return t1.slice(0, length);
}

export async function createVapidJwt(
  audience: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string,
): Promise<string> {
  const pubBytes = base64UrlDecode(vapidPublicKey);
  if (pubBytes.length !== 65 || pubBytes[0] !== 4) {
    throw new Error('Invalid VAPID_PUBLIC_KEY format (expected 65-byte uncompressed P-256 key)');
  }
  const x = base64UrlEncode(pubBytes.slice(1, 33));
  const y = base64UrlEncode(pubBytes.slice(33, 65));

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: vapidPrivateKey,
      x,
      y,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payloadB64 = base64UrlEncode(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  );
  const unsigned = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    enc.encode(unsigned),
  );
  return `${unsigned}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export async function encryptWebPushPayload(
  payloadText: string,
  p256dhB64: string,
  authB64: string,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const uaPublicBytes = base64UrlDecode(p256dhB64);
  const authSecret = base64UrlDecode(authB64);

  if (uaPublicBytes.length !== 65 || authSecret.length !== 16) {
    throw new Error('Invalid push subscription encryption keys');
  }

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(uaPublicBytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  const authInfo = concatBytes(enc.encode('WebPush: info\0'), uaPublicBytes, asPublicBytes);
  const ikm = await hkdfExtractAndExpand(authSecret, sharedSecret, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdfExtractAndExpand(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExtractAndExpand(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(cek),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const plaintext = concatBytes(enc.encode(payloadText), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
      aesKey,
      toArrayBuffer(plaintext),
    ),
  );

  const header = new Uint8Array(16 + 4 + 1 + asPublicBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = asPublicBytes.length;
  header.set(asPublicBytes, 21);

  return concatBytes(header, ciphertext);
}

async function sendWebPushMessage(
  subscription: SubscriptionInput,
  payload: { title: string; body: string; url: string },
  env: Environment,
): Promise<{ ok: boolean; status: number; expired: boolean }> {
  const pubKey = (env.VAPID_PUBLIC_KEY || '').trim();
  const privKey = (env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (env.VAPID_SUBJECT || 'mailto:admin@consoulium.in').trim();

  if (!pubKey || !privKey) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required');
  }

  const endpointUrl = new URL(subscription.endpoint);
  const jwt = await createVapidJwt(endpointUrl.origin, pubKey, privKey, subject);
  const encryptedBody = await encryptWebPushPayload(
    JSON.stringify(payload),
    subscription.keys.p256dh,
    subscription.keys.auth,
  );

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
      Authorization: `vapid t=${jwt}, k=${pubKey}`,
    },
    body: toArrayBuffer(encryptedBody),
  });

  return {
    ok: res.ok,
    status: res.status,
    expired: res.status === 404 || res.status === 410,
  };
}

function getSupabaseAdminConfig(env: Environment) {
  const url = (env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) {
    return null;
  }
  return { url, serviceKey };
}

async function supabaseRest(
  cfg: { url: string; serviceKey: string },
  path: string,
  init?: RequestInit,
) {
  return fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

function isValidSubscription(sub: any): sub is SubscriptionInput {
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) return false;
  if (typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') return false;
  try {
    const parsed = new URL(sub.endpoint);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function onRequestGet({ request, env }: PagesContext) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'vapid-key';

  if (action === 'vapid-key') {
    const publicKey = (env.VAPID_PUBLIC_KEY || '').trim();
    return jsonResponse({
      configured: Boolean(publicKey && (env.VAPID_PRIVATE_KEY || '').trim()),
      publicKey: publicKey || null,
    });
  }

  if (action === 'status') {
    const cfg = getSupabaseAdminConfig(env);
    const slug = (url.searchParams.get('slug') || '').trim();
    const endpoint = (url.searchParams.get('endpoint') || '').trim();
    if (!cfg || !SLUG_RE.test(slug) || !endpoint) {
      return jsonResponse({ subscribed: false });
    }
    const res = await supabaseRest(
      cfg,
      `candidate_push_subscriptions?select=id&candidate_slug=eq.${encodeURIComponent(slug)}&endpoint=eq.${encodeURIComponent(endpoint)}&limit=1`,
    );
    if (!res.ok) return jsonResponse({ subscribed: false });
    const rows = (await res.json()) as Array<{ id: string }>;
    return jsonResponse({ subscribed: Array.isArray(rows) && rows.length > 0 });
  }

  return jsonResponse({ error: 'Unknown action' }, 400);
}

export async function onRequestPost({ request, env }: PagesContext) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const action = String(body?.action || '').trim();

  if (action === 'subscribe') {
    const cfg = getSupabaseAdminConfig(env);
    if (!cfg) {
      return jsonResponse({ error: 'Push database service is not configured on Cloudflare.' }, 503);
    }

    const slug = String(body?.slug || '').trim();
    const tenantId = String(body?.tenant_id || '').trim();
    const festivalId = body?.festival_id ? String(body.festival_id).trim() : null;
    if (!SLUG_RE.test(slug) || !UUID_RE.test(tenantId)) {
      return jsonResponse({ error: 'Invalid candidate slug or tenant_id' }, 400);
    }
    if (festivalId && !UUID_RE.test(festivalId)) {
      return jsonResponse({ error: 'Invalid festival_id' }, 400);
    }
    if (!isValidSubscription(body?.subscription)) {
      return jsonResponse({ error: 'Invalid Web Push subscription' }, 400);
    }

    const res = await supabaseRest(cfg, 'candidate_push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        tenant_id: tenantId,
        festival_id: festivalId,
        candidate_slug: slug,
        endpoint: body.subscription.endpoint,
        p256dh: body.subscription.keys.p256dh,
        auth: body.subscription.keys.auth,
        user_agent: (request.headers.get('user-agent') || '').slice(0, 280) || null,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      return jsonResponse({ error: 'Could not save push subscription' }, 500);
    }
    return jsonResponse({ ok: true, subscribed: true });
  }

  if (action === 'unsubscribe') {
    const cfg = getSupabaseAdminConfig(env);
    if (!cfg) return jsonResponse({ ok: true, subscribed: false });
    const endpoint = String(body?.endpoint || '').trim();
    if (!endpoint) return jsonResponse({ error: 'Missing endpoint' }, 400);

    await supabaseRest(
      cfg,
      `candidate_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
      { method: 'DELETE' },
    );
    return jsonResponse({ ok: true, subscribed: false });
  }

  if (action === 'send-test') {
    if (!isValidSubscription(body?.subscription)) {
      return jsonResponse({ error: 'Invalid Web Push subscription' }, 400);
    }
    const slug = String(body?.slug || '').trim();
    const name = String(body?.name || 'Candidate').trim().slice(0, 80);
    if (!SLUG_RE.test(slug)) {
      return jsonResponse({ error: 'Invalid candidate slug' }, 400);
    }
    try {
      const result = await sendWebPushMessage(
        body.subscription,
        {
          title: `${name} · Notifications Active`,
          body: 'You will receive alerts here when your Consoulium 2k26 results are published.',
          url: `/candidate/${encodeURIComponent(slug)}?installedPortal=candidate`,
        },
        env,
      );
      return jsonResponse({ ok: result.ok, status: result.status });
    } catch (err) {
      return jsonResponse({ error: String((err as Error)?.message || err) }, 500);
    }
  }

  if (action === 'notify-schedule-published') {
    const cfg = getSupabaseAdminConfig(env);
    if (!cfg) {
      return jsonResponse({ error: 'Push service is not configured' }, 503);
    }
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

    const userRes = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return jsonResponse({ error: 'Unauthorized' }, 401);
    const userData = (await userRes.json()) as { id?: string };
    if (!userData?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

    const profileRes = await supabaseRest(
      cfg,
      `profiles?select=role,is_superadmin&id=eq.${encodeURIComponent(userData.id)}&limit=1`,
    );
    const profiles = (await profileRes.json()) as Array<{ role?: string; is_superadmin?: boolean }>;
    const caller = profiles?.[0];
    if (!caller || (!caller.is_superadmin && !['admin', 'admin_leader'].includes(caller.role || ''))) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const scheduleId = String(body?.schedule_id || '').trim();
    if (!UUID_RE.test(scheduleId)) {
      return jsonResponse({ error: 'Invalid schedule_id' }, 400);
    }

    const schedRes = await supabaseRest(
      cfg,
      `schedules?select=id,item_id,items(item_name_en,item_name_ml)&id=eq.${encodeURIComponent(scheduleId)}&limit=1`,
    );
    const schedRows = (await schedRes.json()) as Array<{
      id: string;
      item_id: string | null;
      items?: { item_name_en?: string | null; item_name_ml?: string | null } | null;
    }>;
    const schedule = schedRows?.[0];
    if (!schedule?.item_id) {
      return jsonResponse({ ok: true, sent: 0 });
    }
    const itemName = (schedule.items?.item_name_en || schedule.items?.item_name_ml || 'Competition').trim();

    const regRes = await supabaseRest(
      cfg,
      `registrations?select=id,participants(name,profile_slug)&schedule_id=eq.${encodeURIComponent(scheduleId)}`,
    );
    const regRows = (await regRes.json()) as Array<{
      id: string;
      participants?: { name?: string | null; profile_slug?: string | null } | null;
    }>;

    const resultRes = await supabaseRest(
      cfg,
      `results?select=registration_id,rank,grade,published&item_id=eq.${encodeURIComponent(schedule.item_id)}&published=eq.true`,
    );
    const resultRows = (await resultRes.json()) as Array<{
      registration_id: string;
      rank: number | null;
      grade: string | null;
    }>;

    const resultByReg = new Map<string, { rank: number | null; grade: string | null }>();
    for (const r of resultRows || []) {
      resultByReg.set(r.registration_id, { rank: r.rank ?? null, grade: r.grade ?? null });
    }

    const candidateInfoBySlug = new Map<string, { name: string; rank: number | null; grade: string | null }>();
    for (const reg of regRows || []) {
      const slug = reg.participants?.profile_slug?.trim();
      if (!slug || !SLUG_RE.test(slug)) continue;
      const resInfo = resultByReg.get(reg.id);
      const prev = candidateInfoBySlug.get(slug);
      const nextRank = resInfo?.rank ?? prev?.rank ?? null;
      const bestRank =
        prev?.rank != null && nextRank != null ? Math.min(prev.rank, nextRank) : nextRank;
      candidateInfoBySlug.set(slug, {
        name: reg.participants?.name?.trim() || 'Candidate',
        rank: bestRank,
        grade: resInfo?.grade ?? prev?.grade ?? null,
      });
    }

    const slugs = Array.from(candidateInfoBySlug.keys());
    if (slugs.length === 0) {
      return jsonResponse({ ok: true, sent: 0 });
    }

    const inFilter = slugs.map((s) => `"${s}"`).join(',');
    const subRes = await supabaseRest(
      cfg,
      `candidate_push_subscriptions?select=endpoint,p256dh,auth,candidate_slug&candidate_slug=in.(${encodeURIComponent(inFilter)})`,
    );
    const subs = (await subRes.json()) as Array<{
      endpoint: string;
      p256dh: string;
      auth: string;
      candidate_slug: string;
    }>;

    let sent = 0;
    const expiredEndpoints: string[] = [];

    await Promise.all(
      (subs || []).map(async (row) => {
        const info = candidateInfoBySlug.get(row.candidate_slug);
        if (!info) return;
        let title = `Result Published · ${itemName}`;
        let msgBody = `Results for ${itemName} are now live on your profile.`;
        if (info.rank === 1) {
          title = `1st Place · ${itemName}`;
          msgBody = `${info.name}, congratulations on winning 1st Place in ${itemName}!`;
        } else if (info.rank === 2) {
          title = `2nd Place · ${itemName}`;
          msgBody = `${info.name}, congratulations on winning 2nd Place in ${itemName}!`;
        } else if (info.rank === 3) {
          title = `3rd Place · ${itemName}`;
          msgBody = `${info.name}, congratulations on winning 3rd Place in ${itemName}!`;
        }
        try {
          const outcome = await sendWebPushMessage(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            {
              title,
              body: msgBody,
              url: `/candidate/${encodeURIComponent(row.candidate_slug)}?installedPortal=candidate`,
            },
            env,
          );
          if (outcome.ok) sent += 1;
          else if (outcome.expired) expiredEndpoints.push(row.endpoint);
        } catch {}
      }),
    );

    if (expiredEndpoints.length > 0) {
      await Promise.all(
        expiredEndpoints.map((ep) =>
          supabaseRest(cfg, `candidate_push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
            method: 'DELETE',
          }),
        ),
      );
    }

    return jsonResponse({ ok: true, total: subs?.length || 0, sent, pruned: expiredEndpoints.length });
  }

  if (action === 'notify-candidate') {
    const cfg = getSupabaseAdminConfig(env);
    if (!cfg) {
      return jsonResponse({ error: 'Push service is not configured' }, 503);
    }
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

    const userRes = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return jsonResponse({ error: 'Unauthorized' }, 401);
    const userData = (await userRes.json()) as { id?: string };
    if (!userData?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

    const profileRes = await supabaseRest(
      cfg,
      `profiles?select=role,is_superadmin&id=eq.${encodeURIComponent(userData.id)}&limit=1`,
    );
    const profiles = (await profileRes.json()) as Array<{ role?: string; is_superadmin?: boolean }>;
    const caller = profiles?.[0];
    if (!caller || (!caller.is_superadmin && !['admin', 'admin_leader'].includes(caller.role || ''))) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const slugs = Array.isArray(body?.slugs)
      ? body.slugs.map((s: unknown) => String(s || '').trim()).filter((s: string) => SLUG_RE.test(s))
      : SLUG_RE.test(String(body?.slug || '').trim())
        ? [String(body.slug).trim()]
        : [];
    if (slugs.length === 0) {
      return jsonResponse({ error: 'Missing candidate slug(s)' }, 400);
    }

    const title = String(body?.title || 'Consoulium 2k26 Result Update').trim().slice(0, 100);
    const msgBody = String(body?.body || 'Check your candidate profile for the latest result update.').trim().slice(0, 240);

    const inFilter = slugs.map((s: string) => `"${s}"`).join(',');
    const subRes = await supabaseRest(
      cfg,
      `candidate_push_subscriptions?select=endpoint,p256dh,auth,candidate_slug&candidate_slug=in.(${encodeURIComponent(inFilter)})`,
    );
    if (!subRes.ok) return jsonResponse({ error: 'Failed to load subscriptions' }, 500);
    const subs = (await subRes.json()) as Array<{
      endpoint: string;
      p256dh: string;
      auth: string;
      candidate_slug: string;
    }>;

    let sent = 0;
    const expiredEndpoints: string[] = [];

    await Promise.all(
      (subs || []).map(async (row) => {
        try {
          const outcome = await sendWebPushMessage(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            {
              title,
              body: msgBody,
              url: `/candidate/${encodeURIComponent(row.candidate_slug)}?installedPortal=candidate`,
            },
            env,
          );
          if (outcome.ok) sent += 1;
          else if (outcome.expired) expiredEndpoints.push(row.endpoint);
        } catch {
          // Continue delivering to remaining subscriptions.
        }
      }),
    );

    if (expiredEndpoints.length > 0) {
      await Promise.all(
        expiredEndpoints.map((ep) =>
          supabaseRest(cfg, `candidate_push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
            method: 'DELETE',
          }),
        ),
      );
    }

    return jsonResponse({ ok: true, total: subs.length, sent, pruned: expiredEndpoints.length });
  }

  return jsonResponse({ error: 'Unknown action' }, 400);
}
