import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { teamLeaderPortalService, TeamLeaderContext } from '@/services/teamLeaderPortalService';
import { useAuthStore } from '@/core/store/authStore';

interface TeamLeaderState {
  context: TeamLeaderContext | null;
  loading: boolean;
  error: string | null;
  portalEnabled: boolean;
  refetch: () => Promise<void>;
}

const TeamLeaderContextProvider = createContext<TeamLeaderState>({
  context: null,
  loading: true,
  error: null,
  portalEnabled: false,
  refetch: async () => {},
});

export function useTeamLeaderContext() {
  return useContext(TeamLeaderContextProvider);
}

export function TeamLeaderProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<TeamLeaderContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialized = useAuthStore((state) => state.initialized);
  const role = useAuthStore((state) => state.role);

  const fetchContext = useCallback(async () => {
    try {
      setError(null);
      const data = await teamLeaderPortalService.getContext();
      if (data) {
        setContext(data);
        setPortalEnabled(true);
      } else {
        setContext(null);
        setPortalEnabled(false);
      }
    } catch (err: any) {
      console.error('Failed to fetch team leader context:', err);
      setError(err?.message || 'Failed to load portal context');
      // A definitive authorization failure must not leave previously loaded
      // team data visible. Transient connectivity/server errors preserve it.
      if (err?.status === 401 || err?.status === 403 || err?.code === '42501') {
        setContext(null);
        setPortalEnabled(false);
      }
      // Keep the last verified team context during a temporary network/RPC failure.
      // A successful response with no active assignment still clears it above.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialized || role !== 'team_leader') {
      setContext(null);
      setError(null);
      setPortalEnabled(false);
      setLoading(false);
      return;
    }

    fetchContext();
    // Refresh every 5 minutes
    intervalRef.current = setInterval(fetchContext, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchContext, initialized, role]);

  useEffect(() => {
    if (role !== 'team_leader' || typeof window === 'undefined') return;
    const refreshWhenOnline = () => { void fetchContext(); };
    window.addEventListener('online', refreshWhenOnline);
    return () => window.removeEventListener('online', refreshWhenOnline);
  }, [fetchContext, role]);

  return (
    <TeamLeaderContextProvider.Provider
      value={{ context, loading, error, portalEnabled, refetch: fetchContext }}
    >
      {children}
    </TeamLeaderContextProvider.Provider>
  );
}
