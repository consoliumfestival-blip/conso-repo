import { supabase } from '../../core/config/supabase';
import { AuthProfile, AuthProvider, AuthResult } from './AuthProvider';

type ProviderError = { code?: string; message?: string };

type UsernameLoginFunctionResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  userId?: string;
  session?: {
    access_token?: string;
    refresh_token?: string;
  };
};

const invalidCredentialsError = { message: 'Invalid username or password.', code: 'INVALID_CREDENTIALS' };
const unavailableError = { message: 'Login is temporarily unavailable. Please try again.', code: 'LOGIN_UNAVAILABLE' };
const connectionError = { message: 'Could not reach the login service. Check your connection and try again.', code: 'LOGIN_CONNECTION_ERROR' };
const rateLimitError = { message: 'Too many attempts. Please wait a moment before trying again.', code: 'RATE_LIMITED' };

const classifyUsernameLoginError = async (error: unknown) => {
  const context = typeof error === 'object' && error !== null && 'context' in error
    ? (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context
    : undefined;
  let responseCode: string | undefined;
  if (typeof context?.json === 'function') {
    try {
      const body = await context.json() as { error?: unknown };
      if (typeof body?.error === 'string') responseCode = body.error;
    } catch {
      // The HTTP status still distinguishes a service error from bad credentials.
    }
  }
  if (context?.status === 429 || responseCode === 'RATE_LIMITED') return rateLimitError;
  if (context?.status === 401 || responseCode === 'INVALID_CREDENTIALS') return invalidCredentialsError;
  if (!context?.status) return connectionError;
  return unavailableError;
};

const normalizeError = (error: unknown): AuthResult<never>['error'] => {
  if (!error) return null;
  const providerError = error as ProviderError;
  return {
    code: providerError.code,
    message: providerError.message || 'Authentication request failed',
  };
};

export class SupabaseAuthProvider implements AuthProvider {
  async resolveUsernameLogin(
    username: string,
    password: string,
    loginType?: 'team_leader',
  ): Promise<AuthResult<{ user: { id: string }; session: { access_token: string; refresh_token: string } }>> {
    // Username login is resolved and verified by the trusted edge function;
    // only a valid credential pair yields session tokens. Internal Auth email
    // addresses never reach the client.
    try {
      const result = await supabase.functions.invoke('resolve-login-identifier', {
        body: { username, password, ...(loginType ? { login_type: loginType } : {}) },
      });
      if (result.error) throw result.error;
      const data = result.data as UsernameLoginFunctionResponse | null;
      if (
        !data?.success
        || typeof data.userId !== 'string'
        || typeof data.session?.access_token !== 'string'
        || typeof data.session?.refresh_token !== 'string'
      ) {
        return {
          data: null,
          error: data?.error === 'INVALID_CREDENTIALS'
            ? invalidCredentialsError
            : data?.error === 'RATE_LIMITED' ? rateLimitError : unavailableError,
        };
      }
      return {
        data: {
          user: { id: data.userId },
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          },
        },
        error: null,
      };
    } catch (err: unknown) {
      return { data: null, error: await classifyUsernameLoginError(err) };
    }
  }

  async signInWithPassword(email: string, password: string): Promise<AuthResult<{ user: any }>> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    return {
      data: data.user ? { user: data.user } : null,
      error: normalizeError(error),
    };
  }

  async signOut(scope?: 'global' | 'local' | 'others'): Promise<AuthResult<void>> {
    const { error } = scope
      ? await supabase.auth.signOut({ scope })
      : await supabase.auth.signOut();
    return { data: undefined, error: normalizeError(error) };
  }

  async getSession(): Promise<AuthResult<{ user: any } | null>> {
    const { data, error } = await supabase.auth.getSession();
    return {
      data: data.session?.user ? { user: data.session.user } : null,
      error: normalizeError(error),
    };
  }

  async getProfile(userId: string): Promise<AuthResult<AuthProfile>> {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, tenant_id, is_superadmin')
      .eq('id', userId)
      .single();

    return { data: data ?? null, error: normalizeError(error) };
  }
}
