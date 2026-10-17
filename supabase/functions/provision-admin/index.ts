/* eslint-disable import/no-unresolved -- Deno Edge Functions use URL imports. */
// @ts-nocheck
// provision-admin: trusted tenant-admin / child-organisation provisioning endpoint.
//
// Flow (C2 architecture):
//   UI -> service -> repository -> Edge Function -> Supabase Auth Admin API
//                                              \-> finalise_*_provisioning RPC (caller JWT)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const ALLOWED_ORG_TYPES = ['unit', 'sector', 'division', 'district', 'state'];
const ALLOWED_FESTIVAL_TEMPLATES = ['sahithyolsav', 'college_fest'];

// Version marker: returned on every authenticated response and safe
// application-level error. Anonymous requests never reach this function
// (the Supabase gateway rejects them first), so the marker can only be
// verified with a valid JWT.
const VERSION = 'c2-fix-2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status, body) => new Response(JSON.stringify({ ...body, version: body?.version ?? VERSION }), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Provision-Admin-Version': VERSION, ...corsHeaders },
});

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(normalized)) return null;
  if (normalized.length > 254) return null;
  return normalized;
}

function validateUsername(username) {
  if (!username || typeof username !== 'string') return null;
  const u = username.trim().toLowerCase();
  return /^[a-z0-9_]{3,40}$/.test(u) ? u : null;
}

function validateOrgName(name) {
  if (!name || typeof name !== 'string') return null;
  const n = name.trim();
  return (n.length >= 2 && n.length <= 120) ? n : null;
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  // 16 symbols from a 57-character alphabet provides more than 90 bits of
  // entropy. The password is returned once and is never logged or persisted.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json(500, { error: 'PROVISIONING_SERVER_CONFIG', message: 'Server is not configured for provisioning.' });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Authenticate the caller (JWT only - no body claims are trusted).
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'UNAUTHORIZED_NO_AUTH_HEADER', message: 'Missing authorization header' });

    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json(401, { error: 'UNAUTHORIZED_LEGACY_JWT', message: 'Invalid JWT' });

    // 2. Authorize from the database profile (server-side source of truth).
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, is_superadmin, tenant_id')
      .eq('id', user.id)
      .single();
    if (profileError || !profile) return json(403, { error: 'FORBIDDEN', message: 'No authorized profile found.' });

    const isSuperadmin = profile.is_superadmin === true;

    // Caller-scoped client: used for the preflight and finalisation RPC so that
    // auth.uid() inside the database resolves to the ACTING admin.
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'INVALID_JSON', message: 'Invalid request body.' });
    }

    const operation = body?.operation;
    if (operation !== 'status' && operation !== 'root_tenant' && operation !== 'child_organisation' && operation !== 'reset_credential') {
      return json(400, { error: 'INVALID_OPERATION', message: 'Unknown provisioning operation.' });
    }

    // ---- RESET CREDENTIAL (server-resolved target) -------------------------
    if (operation === 'reset_credential') {
      // Defense in depth: SQL repeats this exact role check. The project's
      // profile role constraint has `admin` as its only tenant-admin role.
      if (!isSuperadmin && profile.role !== 'admin') {
        return json(403, { error: 'FORBIDDEN', message: 'You are not authorised to reset credentials.' });
      }

      // The client must never supply an Auth/profile user ID. Target is
      // resolved server-side from organisation_id + target_type.
      if (body?.target_user_id !== undefined && body?.target_user_id !== null) {
        return json(400, { error: 'CLIENT_TARGET_USER_ID_NOT_ALLOWED', message: 'Client-supplied target user IDs are not accepted. Provide organisation_id and target_type.' });
      }

      const targetType = body?.target_type;
      if (targetType !== 'root_admin' && targetType !== 'child_admin') {
        return json(400, { error: 'INVALID_TARGET_TYPE', message: 'target_type must be "root_admin" or "child_admin".' });
      }

      const organisationId = body?.organisation_id;
      if (!organisationId || typeof organisationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organisationId)) {
        return json(400, { error: 'INVALID_TARGET', message: 'A valid organisation_id is required.' });
      }

      if (targetType === 'root_admin' && !isSuperadmin) {
        return json(403, { error: 'FORBIDDEN', message: 'Only a superadmin may reset a root tenant credential.' });
      }

      // Server-side authorization + deterministic admin resolution
      // (service-role transport; function is grant-free / internal-only).
      const { data: resolution, error: resolutionError } = await admin.rpc('resolve_reset_target', {
        p_actor_id: user.id,
        p_target_type: targetType,
        p_organisation_id: organisationId,
      });

      if (resolutionError || !resolution) {
        console.error('C2_RESET_RESOLUTION_FAILED');
        return json(500, { error: 'RESET_RESOLUTION_FAILED', message: 'Could not resolve the credential reset target.' });
      }

      if (resolution.success !== true) {
        const code = resolution.code || 'FORBIDDEN';
        const statusMap = {
          FORBIDDEN: 403, DISABLED: 403, ARCHIVED: 403, NOT_LINKED: 409, NO_ADMIN: 409,
          AMBIGUOUS_ADMIN: 409, NOT_FOUND: 404, INVALID_TARGET_TYPE: 400,
          TARGET_TYPE_MISMATCH: 409, NO_AUTH_USER: 409, NO_LOGIN_IDENTIFIER: 409,
        };
        const messages = {
          FORBIDDEN: 'You are not authorised to reset this credential.',
          DISABLED: 'The target tenant is disabled.',
          ARCHIVED: 'The target organisation is archived.',
          NOT_FOUND: 'The target organisation was not found.',
          NOT_LINKED: 'The target organisation is not linked to a tenant.',
          NO_ADMIN: 'The target organisation has no eligible admin account.',
          AMBIGUOUS_ADMIN: 'The target organisation has multiple admin accounts; reset is disabled until resolved.',
          INVALID_TARGET_TYPE: 'Invalid target type.',
          TARGET_TYPE_MISMATCH: 'The requested admin type does not match the organisation.',
          NO_AUTH_USER: 'The target admin account is not linked to Auth.',
          NO_LOGIN_IDENTIFIER: 'The target admin account has no login identifier.',
        };
        return json(statusMap[code] || 403, { error: `RESET_${code}`, message: messages[code] || 'Credential reset was denied.' });
      }

      const targetUserId = resolution.user_id;
      const tempPassword = generateTemporaryPassword();

      const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, { password: tempPassword });
      if (updateError) {
        console.error('C2_AUTH_PASSWORD_UPDATE_FAILED');
        return json(500, { error: 'CREDENTIAL_RESET_FAILED', message: 'The credential could not be updated. Please retry.' });
      }

      // Audit AFTER the password change; a failed audit must NOT claim the
      // password is unchanged. We report audit_recorded=false instead.
      let auditRecorded = true;
      const { error: auditError } = await admin.from('tenant_access_audit_logs').insert({
        actor_user_id: user.id,
        actor_role: isSuperadmin ? 'superadmin' : 'tenant_admin',
        target_tenant_id: resolution.tenant_id,
        target_organisation_id: organisationId,
        action: 'credential_reset',
        reason: `Operator requested ${targetType} password reset`,
        previous_status: { actor_tenant_id: profile.tenant_id ?? null },
        new_status: {
          result: 'password_updated',
          target_user_id: targetUserId,
          target_type: targetType,
          edge_version: VERSION,
        },
        success: true,
      });
      if (auditError) {
        auditRecorded = false;
        console.error('C2_RESET_AUDIT_INSERT_FAILED');
      }

      const resetResponse = {
        success: true,
        operation: 'reset_credential',
        target_type: targetType,
        organisation_id: organisationId,
        tenant_id: resolution.tenant_id ?? null,
        username: resolution.username ?? null,
        login_identifier: resolution.login_identifier ?? null,
        temporary_password: tempPassword,
        audit_recorded: auditRecorded,
        version: VERSION,
      };
      if (!auditRecorded) {
        return json(207, {
          ...resetResponse,
          partial_success: true,
          message: 'The credential was reset, but the audit event could not be recorded. Do not retry automatically.',
        });
      }

      return json(200, resetResponse);
    }

    // Idempotency key: client-supplied or server-generated.
    let idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
    if (idempotencyKey.length > 128) return json(400, { error: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency key is too long.' });
    if (operation !== 'status' && !idempotencyKey) idempotencyKey = crypto.randomUUID();

    const recordEvent = async (status, fields = {}) => {
      const { error: rpcError } = await admin.rpc('record_provisioning_event', {
        p_operation_type: operation,
        p_idempotency_key: idempotencyKey,
        p_status: status,
        p_requested_by: user.id,
        ...fields,
      });
      return rpcError;
    };

    // ---- STATUS LOOKUP (scoped to the requesting actor) --------------------
    if (operation === 'status') {
      if (!idempotencyKey) return json(400, { error: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency key is required for status lookup.' });
      const { data: op, error: opError } = await admin
        .from('tenant_provisioning_operations')
        .select('*')
        .eq('operation_type', body?.operation_type || 'root_tenant')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (opError) return json(500, { error: 'PROVISIONING_STATUS_FAILED', message: 'Could not read provisioning status.' });
      if (!op) return json(200, { success: false, status: 'not_found' });
      if (op.requested_by !== user.id && !isSuperadmin) {
        return json(403, { error: 'FORBIDDEN', message: 'Not authorized to view this provisioning operation.' });
      }
      return json(200, {
        success: true,
        operation_id: op.id,
        status: op.status,
        operation_type: op.operation_type,
        tenant_id: op.target_tenant_id,
        org_id: op.target_organisation_id,
        organisation_id: op.target_organisation_id,
        admin_email: op.admin_email,
        failure_code: op.failure_code,
        version: VERSION,
      });
    }

    // ---- VALIDATION ---------------------------------------------------------
    const orgName = validateOrgName(body?.org_name);
    const orgType = body?.org_type;
    if (!orgName) return json(400, { error: 'INVALID_ORG_NAME', message: 'Organisation name is invalid (2-120 characters).' });
    if (!ALLOWED_ORG_TYPES.includes(orgType)) {
      return json(400, { error: 'INVALID_ORG_TYPE', message: 'Organisation type is invalid.' });
    }

    const adminEmail = operation === 'root_tenant' ? normalizeEmail(body?.admin_email) : null;
    if (operation === 'root_tenant' && !adminEmail) {
      return json(400, { error: 'INVALID_ADMIN_EMAIL', message: 'A valid admin email is required.' });
    }

    const festivalTemplate = operation === 'root_tenant'
      ? (body?.festival_template || 'sahithyolsav')
      : 'sahithyolsav';
    if (!ALLOWED_FESTIVAL_TEMPLATES.includes(festivalTemplate)) {
      return json(400, { error: 'INVALID_FESTIVAL_TEMPLATE', message: 'Festival template is invalid.' });
    }

    const username = operation === 'child_organisation' ? validateUsername(body?.username) : null;
    if (operation === 'child_organisation' && !username) {
      return json(400, { error: 'INVALID_USERNAME', message: 'Username must be 3-40 lowercase letters, digits or underscores.' });
    }

    // ---- PREFLIGHT AUTHORIZATION AND IDEMPOTENCY LOOKUP ---------------------
    const { data: opId, error: preflightError } = await callerClient.rpc('begin_provisioning_operation', {
      p_operation_type: operation,
      p_idempotency_key: idempotencyKey,
      p_parent_id: body.parent_id || null,
      p_org_name: orgName,
      p_username: operation === 'child_organisation' ? username : adminEmail
    });

    if (preflightError) {
      return json(403, { error: 'PREFLIGHT_DENIED', message: preflightError.message });
    }

    const { data: existingOp } = await admin
      .from('tenant_provisioning_operations')
      .select('*')
      .eq('id', opId)
      .single();

    if (existingOp?.status === 'completed') {
      return json(200, {
        success: true,
        status: 'completed',
        operation_id: existingOp.id,
        tenant_id: existingOp.target_tenant_id,
        org_id: existingOp.target_organisation_id,
        organisation_id: existingOp.target_organisation_id,
        admin_email: existingOp.admin_email,
        message: 'Provisioning was already completed.',
        version: VERSION,
      });
    }

    // ---- AUTH USER CREATION (service role only) -----------------------------
    const REUSABLE_STATUSES = ['pending', 'validated', 'auth_user_created', 'database_linked', 'compensation_pending', 'failed'];
    let targetUserId = (existingOp && REUSABLE_STATUSES.includes(existingOp.status) && existingOp.target_user_id)
      ? existingOp.target_user_id
      : null;
    let createdUserInThisRequest = false;

    if (!targetUserId) {
      const tempPassword = generateTemporaryPassword();
      const fullName = `${orgName} Admin`;
      const email = operation === 'root_tenant'
        ? adminEmail
        : `${username}_${crypto.randomUUID().slice(0, 4)}@sahi.local`;

      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !createdUser?.user) {
        await recordEvent('failed', { p_failure_code: 'AUTH_USER_CREATE_FAILED' });
        return json(409, {
          error: 'AUTH_USER_CREATE_FAILED',
          message: 'The admin account could not be created (the email may already be registered).',
        });
      }

      targetUserId = createdUser.user.id;
      createdUserInThisRequest = true;

      const eventError = await recordEvent('auth_user_created', {
        p_target_organisation_id: body?.org_id || null,
        p_target_user_id: targetUserId,
        p_admin_email: email,
      });
      if (eventError) console.error('record auth_user_created failed', eventError.message);

      body.__tempPassword = tempPassword;
      body.__createdEmail = email;
    }

    // ---- DATABASE FINALISATION (caller-scoped client) -----------------------
    const finalisePayload = operation === 'root_tenant'
      ? {
          p_org_id: body.org_id,
          p_user_id: targetUserId,
          p_org_name: orgName,
          p_org_type: orgType,
          p_idempotency_key: idempotencyKey,
          p_festival_template: festivalTemplate,
        }
      : {
          p_parent_id: body.parent_id,
          p_user_id: targetUserId,
          p_org_name: orgName,
          p_org_type: orgType,
          p_username: username,
          p_idempotency_key: idempotencyKey,
        };
    const rpcName = operation === 'root_tenant'
      ? 'finalise_tenant_provisioning'
      : 'finalise_child_organisation_provisioning';

    const { data: finaliseData, error: finaliseError } = await callerClient.rpc(rpcName, finalisePayload);

    if (finaliseError || !finaliseData?.success) {
      let compensated = false;
      try {
        const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
        if (!deleteError || deleteError.status === 404) {
          compensated = true;
        } else {
          console.error('compensation deleteUser failed', deleteError.message);
        }
      } catch (e) {
        console.error('compensation deleteUser threw', e?.message);
      }

      await recordEvent(compensated ? 'compensated' : 'compensation_pending', {
        p_target_organisation_id: body?.org_id || null,
        p_target_user_id: targetUserId,
        p_failure_code: 'DATABASE_FINALISATION_FAILED',
      });

      return json(502, {
        error: compensated ? 'PROVISIONING_DATABASE_LINK_FAILED_COMPENSATED' : 'PROVISIONING_COMPENSATION_PENDING',
        message: compensated
          ? 'The database link failed; the temporary account was safely removed. Please retry.'
          : 'The database link failed and the temporary account could not be auto-removed. Retry with the same operation to resume safely.',
        operation_id: existingOp?.id || null,
      });
    }

    return json(200, {
      success: true,
      status: 'completed',
      operation_id: finaliseData.operation_id,
      tenant_id: finaliseData.tenant_id,
      org_id: finaliseData.org_id ?? finaliseData.parent_id ?? null,
      organisation_id: finaliseData.org_id ?? finaliseData.parent_id ?? null,
      parent_id: finaliseData.parent_id ?? null,
      admin_email: body.__createdEmail ?? (operation === 'root_tenant' ? adminEmail : username),
      login_identifier: body.__createdEmail ?? (operation === 'root_tenant' ? adminEmail : username),
      username: username,
      temporary_password: createdUserInThisRequest ? (body.__tempPassword ?? null) : null,
      message: 'Provisioning completed.',
      version: VERSION,
    });
  } catch (err) {
    console.error('provision-admin error', err?.message);
    return json(500, { error: 'PROVISIONING_FAILED', message: 'Provisioning failed. Please retry.' });
  }
});
