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
      setContext(null);
      setPortalEnabled(false);
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

  return (
    <TeamLeaderContextProvider.Provider
      value={{ context, loading, error, portalEnabled, refetch: fetchContext }}
    >
      {children}
    </TeamLeaderContextProvider.Provider>
  );
}
