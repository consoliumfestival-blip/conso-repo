import { create } from 'zustand';
import { DevConfig } from '../config/dev_config';
import { authService } from '../../services/authService';

interface AuthState {
  user: any | null;
  tenant_id: string | null;
  role: 'admin' | 'judge' | 'volunteer' | 'participant' | 'team_leader' | null;
  is_superadmin: boolean;
  initialized: boolean;
  teamSessionStatus: 'idle' | 'checking' | 'error';
  teamSessionError: string | null;
  setUser: (user: any, tenant_id: string | null, role: any, is_superadmin?: boolean) => void;
  logout: () => Promise<void>;
  setInitialized: (val: boolean) => void;
  checkSession: (options?: { teamLeaderRoute?: boolean }) => Promise<void>;
  logoutTeamLeader: () => Promise<void>;
}

let sessionCheckVersion = 0;

const retryDelay = (attempt: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, 500 * attempt);
});

export const useAuthStore = create<AuthState>((set) => ({
  user: DevConfig.isDevMode ? { id: 'dev-user', email: 'shibilikds938@gmail.com' } : null,
  tenant_id: DevConfig.isDevMode ? DevConfig.tenant_id : null,
  role: DevConfig.isDevMode ? (DevConfig.role as any) : null,
  is_superadmin: DevConfig.isDevMode ? ((DevConfig as any).is_superadmin ?? false) : false,
  initialized: DevConfig.isDevMode,
  teamSessionStatus: 'idle',
  teamSessionError: null,

  setUser: (user, tenant_id, role, is_superadmin = false) => {
    sessionCheckVersion += 1;
    set({ user, tenant_id, role, is_superadmin, initialized: true, teamSessionStatus: 'idle', teamSessionError: null });
  },

  logout: async () => {
    await authService.logout();
    sessionCheckVersion += 1;
    set({ user: null, tenant_id: null, role: null, is_superadmin: false, initialized: true, teamSessionStatus: 'idle', teamSessionError: null });
  },

  logoutTeamLeader: async () => {
    await authService.logoutTeamLeader();
    sessionCheckVersion += 1;
    set({ user: null, tenant_id: null, role: null, is_superadmin: false, initialized: true, teamSessionStatus: 'idle', teamSessionError: null });
  },

  setInitialized: (val) => set({ initialized: val }),

  checkSession: async (options = {}) => {
    if (DevConfig.isDevMode) return;
    const teamLeaderRoute = options.teamLeaderRoute === true;
    const checkVersion = ++sessionCheckVersion;
    const isCurrentCheck = () => checkVersion === sessionCheckVersion;

    if (teamLeaderRoute) {
      set({ initialized: false, teamSessionStatus: 'checking', teamSessionError: null });
    }

    const attempts = teamLeaderRoute ? 3 : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const session = await authService.getCurrentSession({ teamLeaderRoute });
        if (!isCurrentCheck()) return;

        if (session?.user) {
          set({
            user: session.user,
            role: session.role,
            tenant_id: session.tenant_id,
            is_superadmin: session.is_superadmin,
            initialized: true,
            teamSessionStatus: 'idle',
            teamSessionError: null,
          });
          return;
        }
        set({ user: null, role: null, tenant_id: null, is_superadmin: false, initialized: true, teamSessionStatus: 'idle', teamSessionError: null });
        return;
      } catch (error) {
        if (!isCurrentCheck()) return;
        if (teamLeaderRoute && attempt < attempts) {
          await retryDelay(attempt);
          continue;
        }

        console.error('Error checking session:', error);
        if (teamLeaderRoute) {
          const code = (error as { code?: string } | null)?.code;
          const message = code === 'TENANT_ACCESS_DISABLED'
            ? 'Team Leader access is currently disabled. Contact your festival administrator, or sign out below.'
            : 'Your Team Leader session may still be active, but it could not be verified. Check your connection and retry.';
          set({ initialized: true, teamSessionStatus: 'error', teamSessionError: message });
        } else {
          set({ initialized: true });
        }
        return;
      }
    }
  },
}));
