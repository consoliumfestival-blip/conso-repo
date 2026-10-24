import { authProvider } from '../providers/auth';
import { supabase } from '../core/config/supabase';

export type LoginResult = {
  user: any;
  tenant_id: string | null;
  role: any;
  is_superadmin: boolean;
};

export type SessionResult = LoginResult | null;

const friendlyError = (msg: string): string => {
  if (!msg) return 'An unexpected error occurred.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials') || m.includes('invalid username')) {
    return 'Incorrect email or password. Please check and try again.';
  }
  if (m.includes('email not confirmed')) return 'Your email is not verified. Please check your inbox.';
  if (m.includes('too many requests')) {
    return 'Too many failed attempts. Please wait a moment before trying again.';
  }
  if (m.includes('profile not found')) {
    return 'Account setup incomplete. Please contact your administrator.';
  }
  return msg;
};

const getRequiredProfile = async (userId: string, preferRpc = false) => {
  if (preferRpc) {
    const { data: rpcRows, error: rpcError } = await supabase.rpc('get_my_login_profile');
    const rpcProfile = rpcRows?.[0];
    if (!rpcError && rpcProfile) return rpcProfile;

    // Team Leader RLS intentionally blocks direct profile reads in current deployments.
    // Keep the direct read only as a compatibility fallback for older deployments.
    const directProfile = await authProvider.getProfile(userId);
    if (!directProfile.error && directProfile.data) return directProfile.data;
    throw new Error('Your session is saved, but account access could not be verified. Try again when online.');
  }

  const directProfile = await authProvider.getProfile(userId);
  if (!directProfile.error && directProfile.data) return directProfile.data;

  const { data: rpcRows, error: rpcError } = await supabase.rpc('get_my_login_profile');
  const rpcProfile = rpcRows?.[0];
  if (rpcError || !rpcProfile) throw new Error('Profile not found. Please contact an administrator.');
  return rpcProfile;
};

const resolveUserLogin = async (identifier: string, password: string, loginType?: 'team_leader') => {
  const submittedIdentifier = identifier.trim();

  // Email login: resolve directly against Supabase Auth.
  if (!loginType && submittedIdentifier.includes('@')) {
    const { data, error } = await authProvider.signInWithPassword(submittedIdentifier.toLowerCase(), password);
    if (error) throw new Error(error.message);
    if (!data?.user) throw new Error('Login failed. Please try again.');
    return data;
  }

  // Username login: the Edge Function resolves the internal Auth email,
  // verifies the password, and returns session tokens without exposing email.
  const normalizedIdentifier = loginType === 'team_leader'
    ? submittedIdentifier
    : submittedIdentifier.toLowerCase();
  const { data, error } = await authProvider.resolveUsernameLogin(normalizedIdentifier, password, loginType);
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Login failed. Please try again.');

  const { data: installedSession, error: sessionError } = await supabase.auth.setSession(data.session);
  if (sessionError || !installedSession.user) {
    throw new Error('Login failed. Please try again.');
  }
  return { ...data, user: installedSession.user };
};

const buildLoginResult = async (resolved: { user?: any }, teamLeaderRoute = false): Promise<LoginResult> => {
  const userId = resolved.user?.id;
  if (!userId) throw new Error('Login failed. Please try again.');

  const profile = await getRequiredProfile(userId, teamLeaderRoute);
  await assertTenantEnabled(profile.tenant_id, profile.is_superadmin || false, {
    preserveTeamLeaderSession: teamLeaderRoute,
  });
  return {
    user: resolved.user,
    tenant_id: profile.tenant_id,
    role: profile.role,
    is_superadmin: profile.is_superadmin || false,
  };
};

const assertTenantEnabled = async (
  tenantId: string | null | undefined,
  isSuperadmin?: boolean,
  options: { preserveTeamLeaderSession?: boolean } = {},
) => {
  if (!tenantId) return;
  if (isSuperadmin) return;
  const { data, error } = await supabase.rpc('get_my_access_status');
  if (error && options.preserveTeamLeaderSession) {
    throw new Error('Your session is saved, but account access could not be verified. Try again when online.');
  }
  const status = data ?? {};
  if (status.access_disabled) {
    if (!options.preserveTeamLeaderSession) {
      try {
        await authProvider.signOut();
      } catch {
        // best-effort cleanup; the blocked-access error below is authoritative
      }
    }
    const error = new Error('Tenant access has been disabled. Please contact the festival administrator.') as Error & { code?: string };
    error.code = 'TENANT_ACCESS_DISABLED';
    throw error;
  }
};

export const authService = {
  friendlyError,

  async login(identifier: string, password: string): Promise<LoginResult> {
    const resolved = await resolveUserLogin(identifier, password);
    return buildLoginResult(resolved);
  },

  async loginTeamLeader(username: string, password: string): Promise<LoginResult> {
    const resolved = await resolveUserLogin(username, password, 'team_leader');
    return buildLoginResult(resolved, true);
  },

  async logout(): Promise<void> {
    const { error } = await authProvider.signOut();
    if (error) throw new Error(error.message);
  },

  async logoutTeamLeader(): Promise<void> {
    const { error } = await authProvider.signOut('local');
    if (error) throw new Error(error.message);
  },

  async getCurrentSession(options: { teamLeaderRoute?: boolean } = {}): Promise<SessionResult> {
    const { data, error } = await authProvider.getSession();
    if (error) throw new Error(error.message);
    if (!data?.user) return null;

    const profile = await getRequiredProfile(data.user.id, options.teamLeaderRoute);
    await assertTenantEnabled(profile.tenant_id, profile.is_superadmin || false, {
      preserveTeamLeaderSession: options.teamLeaderRoute,
    });
    return {
      user: data.user,
      tenant_id: profile.tenant_id,
      role: profile.role,
      is_superadmin: profile.is_superadmin || false,
    };
  },
};
