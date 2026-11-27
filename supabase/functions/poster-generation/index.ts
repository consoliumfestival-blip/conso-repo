import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { HeadObjectCommand } from 'npm:@aws-sdk/client-s3';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { R2_BUCKET, s3Client } from '../_shared/r2Client.ts';

type SupabaseServiceClient = ReturnType<typeof createClient<any>>;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RESOLUTIONS = new Set(['thumb', 'share', 'standard', 'hd', 'print']);
const ADMIN_ROLES = new Set(['super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type JsonRecord = Record<string, unknown>;

interface VerifiedOutput extends JsonRecord {
  outputId: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  resolutions: string[];
  etag: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonResponse(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeOptionalUuid(value: unknown): string | null {
  return value === null || value === undefined || value === '' ? null : (isUuid(value) ? value : null);
}

function validateOutputRecords(value: unknown, festivalId: string, operationId: string): JsonRecord[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > RESOLUTIONS.size) return null;

  const prefixes = [
    `cons-assets/posters/${festivalId}/${operationId}/`,
    `festivals/${festivalId}/posters/${operationId}/`,
  ];
  const seenKeys = new Set<string>();
  const seenResolutions = new Set<string>();

  for (const output of value) {
    if (!isRecord(output)) return null;
    const { outputId, storageKey, contentType, byteSize, width, height, resolutions } = output;
    const extension = typeof storageKey === 'string' ? storageKey.split('.').at(-1)?.toLowerCase() : undefined;
    const expectedType = extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'png'
      ? 'image/png'
      : extension === 'webp'
      ? 'image/webp'
      : null;
    const matchingPrefix = typeof storageKey === 'string'
      ? prefixes.find((prefix) => storageKey.startsWith(prefix))
      : undefined;
    if (
      typeof outputId !== 'string' || !outputId.trim()
      || typeof storageKey !== 'string' || !matchingPrefix
      || !/^[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(storageKey.slice(matchingPrefix.length))
      || seenKeys.has(storageKey)
      || typeof contentType !== 'string' || !IMAGE_TYPES.has(contentType)
      || contentType !== expectedType
      || !Number.isSafeInteger(byteSize) || Number(byteSize) <= 0
      || !Number.isSafeInteger(width) || Number(width) <= 0
      || !Number.isSafeInteger(height) || Number(height) <= 0
      || !Array.isArray(resolutions) || resolutions.length === 0
    ) return null;

    seenKeys.add(storageKey);
    for (const resolution of resolutions) {
      if (typeof resolution !== 'string' || !RESOLUTIONS.has(resolution) || seenResolutions.has(resolution)) return null;
      seenResolutions.add(resolution);
    }
  }
  return value;
}

async function getAuthenticatedUser(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { user: null, admin: null, error: jsonResponse(401, { error: 'Authentication is required.' }) };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    return { user: null, admin: null, error: jsonResponse(401, { error: 'Authentication is required.' }) };
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return { user, admin, error: null };
}

async function authorizeTenant(admin: SupabaseServiceClient, userId: string, tenantId: string) {
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, tenant_id, role, is_superadmin')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || !profile) return false;
  if (profile.is_superadmin !== true && (profile.tenant_id !== tenantId || !ADMIN_ROLES.has(profile.role))) return false;

  const [{ data: tenant, error: tenantError }, { data: moduleEnabled, error: moduleError }] = await Promise.all([
    admin.from('tenants').select('id, access_disabled').eq('id', tenantId).maybeSingle(),
    admin.rpc('tenant_module_enabled', { p_tenant_id: tenantId, p_module: 'poster_studio' }),
  ]);
  return !tenantError && tenant?.access_disabled === false && !moduleError && moduleEnabled === true;
}

async function authorizeScope(admin: SupabaseServiceClient, input: JsonRecord) {
  const tenantId = input.tenantId as string;
  const festivalId = input.festivalId as string;
  const itemId = normalizeOptionalUuid(input.itemId);
  const resultId = normalizeOptionalUuid(input.resultId);
  const templateId = normalizeOptionalUuid(input.templateId);
  if (!itemId && !resultId) return null;

  const { data: festival, error: festivalError } = await admin
    .from('festival_calendar')
    .select('id, tenant_id')
    .eq('id', festivalId)
    .maybeSingle();
  if (festivalError || !festival || festival.tenant_id !== tenantId) return null;

  if (itemId) {
    const { data: item, error } = await admin
      .from('items')
      .select('id, tenant_id, festival_id')
      .eq('id', itemId)
      .maybeSingle();
    if (error || !item || item.tenant_id !== tenantId || item.festival_id !== festivalId) return null;
  }

  if (resultId) {
    const { data: result, error } = await admin
      .from('results')
      .select('id, tenant_id, festival_id, item_id')
      .eq('id', resultId)
      .maybeSingle();
    if (
      error || !result || result.tenant_id !== tenantId || result.festival_id !== festivalId
      || (itemId && result.item_id !== itemId)
    ) return null;

    if (!itemId && result.item_id) {
      const { data: resultItem, error: itemError } = await admin
        .from('items')
        .select('id')
        .eq('id', result.item_id)
        .eq('tenant_id', tenantId)
        .eq('festival_id', festivalId)
        .maybeSingle();
      if (itemError || !resultItem) return null;
    }
  }

  if (templateId) {
    const { data: template, error } = await admin
      .from('poster_templates')
      .select('id')
      .eq('id', templateId)
      .eq('tenant_id', tenantId)
      .eq('festival_id', festivalId)
      .maybeSingle();
    if (error || !template) return null;
  }

  return { tenantId, festivalId, itemId, resultId, templateId };
}

function generationResponse(generation: JsonRecord, assetIds: string[]): JsonRecord {
  return {
    found: true,
    generationId: generation.id,
    operationId: generation.operation_id,
    assetIds,
    renderHash: generation.render_hash,
    visibilityStatus: generation.visibility_status,
    isCurrent: generation.is_current,
  };
}

function canonicalJson(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? null;
  if (Array.isArray(value)) {
    const entries = value.map(canonicalJson);
    return entries.some((entry) => entry === null) ? null : `[${entries.join(',')}]`;
  }
  const record = value as JsonRecord;
  const entries = Object.keys(record).sort().map((key) => {
    const encoded = canonicalJson(record[key]);
    return encoded === null ? null : `${JSON.stringify(key)}:${encoded}`;
  });
  return entries.some((entry) => entry === null) ? null : `{${entries.join(',')}}`;
}

function canonicalOutputMetadata(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.map((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.resolutions)) return null;
    return {
      outputId: entry.outputId,
      storageKey: entry.storageKey,
      contentType: entry.contentType,
      byteSize: entry.byteSize,
      width: entry.width,
      height: entry.height,
      resolutions: [...entry.resolutions].sort(),
    };
  });
  if (normalized.some((entry) => entry === null)) return null;
  normalized.sort((a, b) => String(a?.storageKey).localeCompare(String(b?.storageKey)));
  return canonicalJson(normalized);
}

async function callFinalizer(
  admin: SupabaseServiceClient,
  userId: string,
  operationId: string,
  scope: { tenantId: string; festivalId: string; itemId: string | null; resultId: string | null; templateId: string | null },
  snapshot: unknown,
  verifiedOutputs: unknown,
): Promise<Response> {
  const { data, error } = await admin.rpc('finalize_poster_generation', {
    p_actor_id: userId,
    p_operation_id: operationId,
    p_tenant_id: scope.tenantId,
    p_festival_id: scope.festivalId,
    p_item_id: scope.itemId,
    p_result_id: scope.resultId,
    p_template_id: scope.templateId,
    p_design_snapshot: snapshot,
    p_verified_outputs: verifiedOutputs,
  });

  if (error) {
    const isConflict = error.message?.includes('poster_generation_operation_conflict');
    const isAuthorizationError = error.code === '42501';
    return jsonResponse(isConflict ? 409 : isAuthorizationError ? 403 : 500, {
      error: isConflict
        ? 'This operation ID already belongs to a different poster submission.'
        : isAuthorizationError
        ? 'Poster Studio access denied.'
        : 'Poster generation could not be finalized.',
    });
  }
  if (!isRecord(data)) return jsonResponse(500, { error: 'Poster generation returned an invalid response.' });
  return jsonResponse(200, { found: true, ...data });
}

serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  try {
    const { user, admin, error: authError } = await getAuthenticatedUser(request);
    if (authError || !user || !admin) return authError ?? jsonResponse(401, { error: 'Authentication is required.' });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: 'Request body must be valid JSON.' });
    }
    if (!isRecord(body) || !['lookup', 'snapshot', 'finalize'].includes(String(body.action))) {
      return jsonResponse(400, { error: 'Invalid poster generation action.' });
    }

    const operationId = body.operationId;
    if (body.action === 'snapshot') {
      if (!isUuid(body.generationId) || !isUuid(body.tenantId) || !isUuid(body.festivalId)) {
        return jsonResponse(400, { error: 'Invalid generation scope.' });
      }
      const { data: generation, error } = await admin
        .from('poster_generations')
        .select('id, operation_id, tenant_id, festival_id, design_snapshot')
        .eq('id', body.generationId)
        .eq('tenant_id', body.tenantId)
        .eq('festival_id', body.festivalId)
        .maybeSingle();
      if (error) return jsonResponse(500, { error: 'Generation snapshot is unavailable.' });
      if (!generation) return jsonResponse(200, { found: false });
      if (!await authorizeTenant(admin, user.id, generation.tenant_id)) {
        return jsonResponse(403, { error: 'Poster Studio access denied.' });
      }
      if (!isRecord(generation.design_snapshot)) {
        return jsonResponse(409, { error: 'This generation has no valid editable design snapshot.' });
      }
      return jsonResponse(200, {
        found: true,
        generationId: generation.id,
        operationId: generation.operation_id,
        snapshot: generation.design_snapshot,
      });
    }

    if (!isUuid(operationId)) return jsonResponse(400, { error: 'Invalid operation ID.' });

    if (body.action === 'lookup') {
      const { data: generation, error } = await admin
        .from('poster_generations')
        .select('id, operation_id, created_by, tenant_id, festival_id, render_hash, visibility_status, is_current')
        .eq('operation_id', operationId)
        .maybeSingle();
      if (error) return jsonResponse(500, { error: 'Generation lookup is unavailable.' });
      if (!generation || generation.created_by !== user.id) return jsonResponse(200, { found: false });
      if (!await authorizeTenant(admin, user.id, generation.tenant_id)) {
        return jsonResponse(403, { error: 'Poster Studio access denied.' });
      }

      const { data: assets, error: assetError } = await admin
        .from('generated_assets')
        .select('id')
        .eq('generation_id', generation.id)
        .order('resolution');
      if (assetError) return jsonResponse(500, { error: 'Generation assets are unavailable.' });
      return jsonResponse(200, generationResponse(generation, (assets ?? []).map((asset) => asset.id)));
    }

    const { tenantId, festivalId } = body;
    if (!isUuid(tenantId) || !isUuid(festivalId)) return jsonResponse(400, { error: 'Invalid tenant or festival scope.' });
    if (!await authorizeTenant(admin, user.id, tenantId)) return jsonResponse(403, { error: 'Poster Studio access denied.' });

    const scope = await authorizeScope(admin, body);
    if (!scope) return jsonResponse(403, { error: 'Poster scope is outside the authorized tenant or festival.' });

    const snapshot = body.snapshot;
    const snapshotMatchesScope = isRecord(snapshot)
      && snapshot.userId === user.id
      && snapshot.tenantId === tenantId
      && snapshot.festivalId === festivalId
      && snapshot.itemId === scope.itemId
      && snapshot.resultId === scope.resultId
      && (scope.templateId === null || snapshot.templateId === scope.templateId)
      && snapshot.snapshotVersion === 1
      && Number.isSafeInteger(snapshot.width) && Number(snapshot.width) > 0
      && Number.isSafeInteger(snapshot.height) && Number(snapshot.height) > 0
      && Array.isArray(snapshot.layers)
      && isRecord(snapshot.variables)
      && Array.isArray(snapshot.assetReferences)
      && Array.isArray(snapshot.customFontReferences);
    if (!snapshotMatchesScope) return jsonResponse(400, { error: 'Editable snapshot does not match the authorized scope.' });

    const outputs = validateOutputRecords(body.outputs, festivalId, operationId);
    if (!outputs) return jsonResponse(400, { error: 'Poster output metadata is invalid.' });

    const { data: existing, error: existingError } = await admin
      .from('poster_generations')
      .select('id, operation_id, created_by, tenant_id, festival_id, item_id, result_id, template_id, design_snapshot, verified_outputs')
      .eq('operation_id', operationId)
      .maybeSingle();
    if (existingError) return jsonResponse(500, { error: 'Generation idempotency lookup is unavailable.' });
    if (existing) {
      if (
        existing.created_by !== user.id
        || existing.tenant_id !== tenantId
        || existing.festival_id !== festivalId
        || existing.item_id !== scope.itemId
        || existing.result_id !== scope.resultId
        || existing.template_id !== scope.templateId
        || canonicalJson(existing.design_snapshot) !== canonicalJson(snapshot)
        || canonicalOutputMetadata(existing.verified_outputs) !== canonicalOutputMetadata(outputs)
      ) return jsonResponse(409, { error: 'This operation ID already belongs to a different poster submission.' });

      return callFinalizer(admin, user.id, operationId, scope, snapshot, existing.verified_outputs);
    }

    const verifiedOutputs: VerifiedOutput[] = [];
    for (const output of outputs) {
      let head;
      try {
        head = await s3Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: output.storageKey as string }));
      } catch {
        return jsonResponse(409, { error: 'A saved poster object could not be found. Retry the upload before finalizing.' });
      }

      if (head.ContentType !== output.contentType || head.ContentLength !== output.byteSize || !head.ETag) {
        return jsonResponse(409, { error: 'Saved poster object metadata does not match the local output.' });
      }

      verifiedOutputs.push({
        outputId: output.outputId as string,
        storageKey: output.storageKey as string,
        contentType: output.contentType as string,
        byteSize: output.byteSize as number,
        width: output.width as number,
        height: output.height as number,
        resolutions: output.resolutions as string[],
        etag: head.ETag,
      });
    }
    return callFinalizer(admin, user.id, operationId, scope, snapshot, verifiedOutputs);
  } catch (error) {
    console.error('poster-generation failed', error instanceof Error ? error.message : 'Unknown error');
    return jsonResponse(500, { error: 'Poster generation could not be processed.' });
  }
});
