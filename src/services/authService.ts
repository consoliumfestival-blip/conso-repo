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

const getRequiredProfile = async (userId: string) => {
  const directProfile = await authProvider.getProfile(userId);
  if (!directProfile.error && directProfile.data) return directProfile.data;

  const { data: rpcRows, error: rpcError } = await supabase.rpc('get_my_login_profile');
  const rpcProfile = rpcRows?.[0];
  if (rpcError || !rpcProfile) throw new Error('Profile not found. Please contact an administrator.');
  return rpcProfile;
};

const resolveUserLogin = async (identifier: string, password: string) => {
  const trimmed = identifier.trim();

  // Email login: resolve directly against Supabase Auth.
  if (trimmed.includes('@')) {
    const { data, error } = await authProvider.signInWithPassword(trimmed.toLowerCase(), password);
    if (error) throw new Error(error.message);
    if (!data?.user) throw new Error('Login failed. Please try again.');
    return data;
  }

  // Username login (child unit admins): the login edge function resolves the
  // synthetic email server-side, verifies the password, and returns session
  // tokens. This avoids any client-side email enumeration surface.
  const { data, error } = await authProvider.resolveUsernameLogin(trimmed.toLowerCase(), password);
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Login failed. Please try again.');

  const { data: installedSession, error: sessionError } = await supabase.auth.setSession(data.session);
  if (sessionError || !installedSession.user) {
    throw new Error('Login failed. Please try again.');
  }
  return { ...data, user: installedSession.user };
};

const assertTenantEnabled = async (tenantId: string | null | undefined, isSuperadmin?: boolean) => {
  if (!tenantId) return;
  if (isSuperadmin) return;
  const { data } = await supabase.rpc('get_my_access_status');
  const status = data ?? {};
  if (status.access_disabled) {
    try {
      await authProvider.signOut();
    } catch {
      // best-effort cleanup; the blocked-access error below is authoritative
    }
    throw new Error('Tenant access has been disabled. Please contact the festival administrator.');
  }
};

export const authService = {
  friendlyError,

  async login(identifier: string, password: string): Promise<LoginResult> {
    const resolved = await resolveUserLogin(identifier, password);
    const userId = resolved.user?.id;
    if (!userId) throw new Error('Login failed. Please try again.');

    const profile = await getRequiredProfile(userId);
    await assertTenantEnabled(profile.tenant_id, profile.is_superadmin || false);
    return {
      user: resolved.user,
      tenant_id: profile.tenant_id,
      role: profile.role,
      is_superadmin: profile.is_superadmin || false,
    };
  },

  async logout(): Promise<void> {
    const { error } = await authProvider.signOut();
    if (error) throw new Error(error.message);
  },

  async getCurrentSession(): Promise<SessionResult> {
    const { data, error } = await authProvider.getSession();
    if (error) throw new Error(error.message);
    if (!data?.user) return null;

    const profile = await getRequiredProfile(data.user.id);
    await assertTenantEnabled(profile.tenant_id, profile.is_superadmin || false);
    return {
      user: data.user,
      tenant_id: profile.tenant_id,
      role: profile.role,
      is_superadmin: profile.is_superadmin || false,
    };
  },
};
