/* eslint-disable import/no-unresolved -- Deno Edge Functions use URL imports. */
// @ts-nocheck
// resolve-login-identifier: secure username-based login resolution.
//
// Why this exists:
//   Child organisation admins log in with a username (e.g. makkaraparamba_admin)
//   whose Auth email is synthetic: {username}_{4-hex}@sahi.local. Exposing a
//   resolver that returns that email to anonymous SQL callers enabled account
//   enumeration (R4). This edge performs the resolution and the password
//   verification SERVER-SIDE:
//
//     username + password  ->  edge  ->  resolve_login_email (service role)
//                                    ->  Auth signInWithPassword
//                                    ->  session tokens returned to the client
//
//   The synthetic email never leaves the server, unknown usernames and wrong
//   passwords return the identical generic error, and per-IP/per-username
//   database-backed rate limiting is applied across Edge workers.
//
// NOTE: verify_jwt is disabled for this function ONLY (see config.toml) so it
// can be reached before authentication. It accepts username+password only and
// returns credentials only for a valid pair, so it behaves like a login
// endpoint, not a lookup oracle.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const VERSION = 'login-v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Resolve-Login-Version': VERSION, ...corsHeaders },
});

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' });
  }

  const ip = req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'INVALID_JSON', message: 'Invalid request body.' });
  }

  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!/^[a-z0-9_]{3,40}$/.test(username) || password.length < 6 || password.length > 128) {
    // Identical generic failure for malformed input and bad credentials.
    return json(401, { error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'SERVER_CONFIG', message: 'Server is not configured.' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Shared, atomic rate limiting. Only irreversible hashes are stored; raw IP,
  // username and password are never persisted or logged.
  const [ipHash, usernameHash] = await Promise.all([
    sha256(`ip:${ip}`),
    sha256(`username:${username}`),
  ]);
  const [ipLimit, usernameLimit] = await Promise.all([
    admin.rpc('consume_username_login_attempt', { p_scope: 'ip', p_subject_hash: ipHash }),
    admin.rpc('consume_username_login_attempt', { p_scope: 'username', p_subject_hash: usernameHash }),
  ]);
  if (ipLimit.error || usernameLimit.error) {
    return json(503, { error: 'LOGIN_UNAVAILABLE', message: 'Login is temporarily unavailable. Please try again.' });
  }
  if (ipLimit.data !== true || usernameLimit.data !== true) {
    return json(429, { error: 'RATE_LIMITED', message: 'Too many attempts. Please wait a moment before trying again.' });
  }

  // Server-side email resolution. Unknown usernames and resolution failures
  // produce the identical generic error as a wrong password.
  const { data: email, error: resolveError } = await admin.rpc('resolve_login_email', { p_username: username });

  // Unknown and known usernames both execute an Auth password check, reducing
  // the timing distinction. The dummy address is deterministic but never
  // returned and cannot reveal the internal synthetic login address.
  const dummyHash = await sha256(`dummy:${username}`);
  const loginEmail = !resolveError && typeof email === 'string' && email
    ? email
    : `invalid_${dummyHash.slice(0, 24)}@sahi.local`;

  const { data: signInData, error: signInError } = await admin.auth.signInWithPassword({ email: loginEmail, password });
  if (signInError || !signInData?.session) {
    return json(401, { error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
  }

  // Success: session tokens only (no email, no tenant/org/profile data).
  return json(200, {
    success: true,
    session: {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_in: signInData.session.expires_in,
      token_type: signInData.session.token_type,
    },
    userId: signInData.user.id,
    full_name: signInData.user.user_metadata?.full_name ?? null,
    version: VERSION,
  });
});
