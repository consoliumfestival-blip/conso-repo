import { sendNotification, setVapidDetails } from 'web-push';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function supabaseRequest(env, path, init = {}) {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
  return response;
}

async function makeEventKey(payload) {
  const eventId = typeof payload.alert_correlation_id === 'string' ? payload.alert_correlation_id.trim() : '';
  if (eventId) return `cf-pages:${payload.policy_id}:${eventId}`.slice(0, 200);
  const fallback = `${payload.account_id}|${payload.policy_id}|${payload.ts}|${payload.name}|${payload.text}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fallback));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `cf-pages:${payload.policy_id}:${hex}`;
}

export async function loadSubscriptions(env) {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({ select: 'id,user_id,tenant_id,subscription', order: 'id.asc', limit: String(pageSize), offset: String(offset) });
    const response = await supabaseRequest(env, `admin_web_push_subscriptions?${query}`);
    const page = await response.json();
    all.push(...page);
    if (page.length < pageSize) break;
  }
  const profilesById = new Map();
  const userIds = [...new Set(all.map((row) => row.user_id))];
  for (let index = 0; index < userIds.length; index += 100) {
    const ids = userIds.slice(index, index + 100);
    const query = new URLSearchParams({
      select: 'id,tenant_id,role,is_superadmin,notification_enabled',
      id: `in.(${ids.join(',')})`,
      limit: '100',
    });
    const response = await supabaseRequest(env, `profiles?${query}`);
    for (const profile of await response.json()) profilesById.set(profile.id, profile);
  }

  return all.filter((row) => {
    const profile = profilesById.get(row.user_id);
    if (!profile || profile.notification_enabled === false) return false;
    if (!(profile.is_superadmin === true || profile.role === 'admin' || profile.role === 'admin_leader')) return false;
    return profile.is_superadmin === true || profile.tenant_id === row.tenant_id;
  });
}

async function removeExpiredSubscription(env, id) {
  const query = new URLSearchParams({ id: `eq.${id}` });
  await supabaseRequest(env, `admin_web_push_subscriptions?${query}`, { method: 'DELETE' });
}

async function handleDeploymentAlert(request, env) {
  if (request.headers.get('cf-webhook-auth') !== env.CF_WEBHOOK_SECRET) return json({ error: 'Unauthorized' }, 401);

  let alert;
  try { alert = await request.json(); } catch { return json({ error: 'Invalid JSON payload' }, 400); }
  if (!alert || alert.account_id !== env.CF_ACCOUNT_ID || alert.policy_id !== env.CF_POLICY_ID) {
    return json({ error: 'Unexpected Cloudflare alert source' }, 403);
  }

  const deploymentName = typeof alert.name === 'string' ? alert.name.slice(0, 200) : 'Cloudflare Pages production deployment';
  const urlCandidate = typeof alert.data?.deployment_url === 'string' ? alert.data.deployment_url : null;
  const deploymentUrl = urlCandidate && /^https:\/\//i.test(urlCandidate) ? urlCandidate.slice(0, 500) : null;
  const eventKey = await makeEventKey(alert);

  const claimResponse = await supabaseRequest(env, 'rpc/claim_admin_code_release_event', {
    method: 'POST',
    body: JSON.stringify({
      p_event_key: eventKey,
      p_alert_policy_id: env.CF_POLICY_ID,
      p_deployment_name: deploymentName,
      p_deployment_url: deploymentUrl,
    }),
  });
  const claimed = await claimResponse.json();
  if (claimed !== true) return json({ accepted: true, duplicateOrInProgress: true });

  let allSucceeded = true;
  let sent = 0;
  try {
    const subscriptions = await loadSubscriptions(env);
    setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const payload = JSON.stringify({
      title: 'Consolium app updated',
      body: 'A new production version is ready. Open Consolium and refresh to use it.',
      tag: `consolium-code-release-${eventKey.slice(-48)}`,
      url: '/',
    });

    for (let index = 0; index < subscriptions.length; index += 10) {
      const batch = subscriptions.slice(index, index + 10);
      const results = await Promise.all(batch.map(async (row) => {
        try {
          await sendNotification(row.subscription, payload, { TTL: 86400, urgency: 'normal' });
          sent += 1;
        } catch (error) {
          const status = Number(error?.statusCode || 0);
          if (status === 404 || status === 410) {
            await removeExpiredSubscription(env, row.id).catch(() => { allSucceeded = false; });
            return;
          }
          allSucceeded = false;
        }
      }));
      void results;
    }

    await supabaseRequest(env, 'rpc/finish_admin_code_release_event', {
      method: 'POST',
      body: JSON.stringify({ p_event_key: eventKey, p_sent: allSucceeded }),
    });
    return json({ accepted: true, sent, retryNeeded: !allSucceeded }, allSucceeded ? 202 : 503);
  } catch (error) {
    await supabaseRequest(env, 'rpc/finish_admin_code_release_event', {
      method: 'POST',
      body: JSON.stringify({ p_event_key: eventKey, p_sent: false }),
    }).catch(() => {});
    console.error('Admin release push failed:', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'Release notification delivery failed' }, 503);
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/cloudflare-pages-release') {
      return json({ error: 'Not found' }, 404);
    }
    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CF_WEBHOOK_SECRET', 'CF_ACCOUNT_ID', 'CF_POLICY_ID', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
    if (required.some((key) => !env[key])) return json({ error: 'Worker is not configured' }, 503);
    return handleDeploymentAlert(request, env);
  },
};
