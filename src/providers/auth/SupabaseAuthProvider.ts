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
    password: string
  ): Promise<AuthResult<{ user: { id: string }; session: { access_token: string; refresh_token: string } }>> {
    // Username login is resolved by the trusted edge function: the synthetic
    // email is looked up server-side and verified server-side, and only a
    // valid credential pair yields session tokens. This avoids anonymous SQL
    // enumeration of synthetic login emails.
    try {
      const result = await supabase.functions.invoke('resolve-login-identifier', {
        body: { username, password },
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
          error: { message: data?.message || 'Invalid username or password.', code: data?.error || 'LOGIN_FAILED' },
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
      // FunctionsHttpError carries the JSON body under .context; surface a
      // generic message so username existence is never revealed.
      let message = 'Invalid username or password.';
      const context = typeof err === 'object' && err !== null && 'context' in err
        ? (err as { context?: { json?: () => Promise<unknown> } }).context
        : undefined;
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.json() as { message?: string; error?: string };
          if (body.message && body.error === 'RATE_LIMITED') message = body.message;
        } catch {
          // ignore: fall back to the default generic message
        }
      }
      return { data: null, error: { message, code: 'LOGIN_FAILED' } };
    }
  }

  async signInWithPassword(email: string, password: string): Promise<AuthResult<{ user: any }>> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    return {
      data: data.user ? { user: data.user } : null,
      error: normalizeError(error),
    };
  }

  async signOut(): Promise<AuthResult<void>> {
    const { error } = await supabase.auth.signOut();
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
