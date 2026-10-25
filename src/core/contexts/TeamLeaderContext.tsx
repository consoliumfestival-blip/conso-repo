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

function authContextScope(userId?: string | null, tenantId?: string | null, role?: string | null) {
  return userId ? `${userId}:${tenantId ?? ''}:${role ?? ''}` : null;
}

export function useTeamLeaderContext() {
  return useContext(TeamLeaderContextProvider);
}

export function TeamLeaderProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<TeamLeaderContext | null>(null);
  const [contextOwnerScope, setContextOwnerScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialized = useAuthStore((state) => state.initialized);
  const role = useAuthStore((state) => state.role);
  const userId = useAuthStore((state) => state.user?.id as string | undefined);
  const tenantId = useAuthStore((state) => state.tenant_id);
  const contextScope = authContextScope(userId, tenantId, role);

  const fetchContext = useCallback(async (requestedScope = contextScope) => {
    const currentAuth = useAuthStore.getState();
    if (!requestedScope || authContextScope(currentAuth.user?.id, currentAuth.tenant_id, currentAuth.role) !== requestedScope) return;
    try {
      setError(null);
      const data = await teamLeaderPortalService.getContext();
      const authAfterFetch = useAuthStore.getState();
      if (authContextScope(authAfterFetch.user?.id, authAfterFetch.tenant_id, authAfterFetch.role) !== requestedScope) return;
      if (data) {
        setContext(data);
        setContextOwnerScope(requestedScope);
        setPortalEnabled(true);
      } else {
        setContext(null);
        setContextOwnerScope(requestedScope);
        setPortalEnabled(false);
      }
    } catch (err: any) {
      const authAfterError = useAuthStore.getState();
      if (authContextScope(authAfterError.user?.id, authAfterError.tenant_id, authAfterError.role) !== requestedScope) return;
      console.error('Failed to fetch team leader context:', err);
      setError(err?.message || 'Failed to load portal context');
      // A definitive authorization failure must not leave previously loaded
      // team data visible. Transient connectivity/server errors preserve it.
      if (err?.status === 401 || err?.status === 403 || err?.code === '42501') {
        setContext(null);
        setContextOwnerScope(requestedScope);
        setPortalEnabled(false);
      }
      // Keep the last verified team context during a temporary network/RPC failure.
      // A successful response with no active assignment still clears it above.
    } finally {
      const authAfterFetch = useAuthStore.getState();
      if (authContextScope(authAfterFetch.user?.id, authAfterFetch.tenant_id, authAfterFetch.role) === requestedScope) setLoading(false);
    }
  }, [contextScope]);

  useEffect(() => {
    if (!initialized || role !== 'team_leader' || !contextScope) {
      setContext(null);
      setContextOwnerScope(null);
      setError(null);
      setPortalEnabled(false);
      setLoading(false);
      return;
    }

    // A different team-leader account must not briefly inherit the prior
    // account's cached team context while its scoped RPC is loading.
    setContext(null);
    setContextOwnerScope(contextScope);
    setError(null);
    setPortalEnabled(false);
    setLoading(true);
    void fetchContext(contextScope);
    // Refresh every 5 minutes
    intervalRef.current = setInterval(() => { void fetchContext(contextScope); }, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchContext, initialized, role, contextScope]);

  useEffect(() => {
    if (role !== 'team_leader' || typeof window === 'undefined') return;
    const refreshWhenOnline = () => { void fetchContext(); };
    window.addEventListener('online', refreshWhenOnline);
    return () => window.removeEventListener('online', refreshWhenOnline);
  }, [fetchContext, role]);

  const contextBelongsToCurrentScope = role === 'team_leader' && !!contextScope && contextOwnerScope === contextScope;

  return (
    <TeamLeaderContextProvider.Provider
      value={{
        context: contextBelongsToCurrentScope ? context : null,
        loading: loading || (initialized && role === 'team_leader' && !!contextScope && !contextBelongsToCurrentScope),
        error: contextBelongsToCurrentScope ? error : null,
        portalEnabled: contextBelongsToCurrentScope && portalEnabled,
        refetch: fetchContext,
      }}
    >
      {children}
    </TeamLeaderContextProvider.Provider>
  );
}
