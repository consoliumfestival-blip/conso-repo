import { create } from 'zustand';
import { DevConfig } from '../config/dev_config';
import { authService } from '../../services/authService';

interface AuthState {
  user: any | null;
  tenant_id: string | null;
  role: 'admin' | 'judge' | 'volunteer' | 'participant' | 'team_leader' | null;
  is_superadmin: boolean;
  initialized: boolean;
  setUser: (user: any, tenant_id: string | null, role: any, is_superadmin?: boolean) => void;
  logout: () => Promise<void>;
  setInitialized: (val: boolean) => void;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: DevConfig.isDevMode ? { id: 'dev-user', email: 'shibilikds938@gmail.com' } : null,
  tenant_id: DevConfig.isDevMode ? DevConfig.tenant_id : null,
  role: DevConfig.isDevMode ? (DevConfig.role as any) : null,
  is_superadmin: DevConfig.isDevMode ? ((DevConfig as any).is_superadmin ?? false) : false,
  initialized: DevConfig.isDevMode,

  setUser: (user, tenant_id, role, is_superadmin = false) => set({ user, tenant_id, role, is_superadmin, initialized: true }),

  logout: async () => {
    await authService.logout();
    set({ user: null, tenant_id: null, role: null, is_superadmin: false, initialized: true });
  },

  setInitialized: (val) => set({ initialized: val }),

  checkSession: async () => {
    if (DevConfig.isDevMode) return;

    try {
      const session = await authService.getCurrentSession();
      
      if (session?.user) {
        set({ 
          user: session.user, 
          role: session.role, 
          tenant_id: session.tenant_id, 
          is_superadmin: session.is_superadmin,
          initialized: true 
        });
        return;
      }
      set({ user: null, role: null, tenant_id: null, is_superadmin: false, initialized: true });
    } catch (e) {
      console.error('Error checking session:', e);
      set({ initialized: true });
    }
  },
}));
