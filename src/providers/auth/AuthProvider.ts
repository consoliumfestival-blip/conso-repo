export type AuthResult<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

export type AuthProfile = {
  role: 'admin' | 'judge' | 'volunteer' | 'participant' | string | null;
  tenant_id: string | null;
  is_superadmin: boolean | null;
};

export interface AuthProvider {
  resolveUsernameLogin(username: string, password: string): Promise<AuthResult<{
    user: { id: string };
    session: { access_token: string; refresh_token: string };
  }>>;
  signInWithPassword(email: string, password: string): Promise<AuthResult<{ user: any }>>;
  signOut(): Promise<AuthResult<void>>;
  getSession(): Promise<AuthResult<{ user: any } | null>>;
  getProfile(userId: string): Promise<AuthResult<AuthProfile>>;
}
