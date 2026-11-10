import React from 'react';
declare global { interface Window { teamCacheFixture: any; setTeamCacheAuth: (user: string | null) => void; } }
let auth: any = { initialized: true, role: 'team_leader', user: { id: 'user-a' }, tenant_id: 'tenant' };
const listeners = new Set<() => void>();
function store<T>(selector: (state: any) => T): T {
  const state = React.useSyncExternalStore((callback) => { listeners.add(callback); return () => listeners.delete(callback); }, () => auth);
  return selector(state);
}
store.getState = () => auth;
export const useAuthStore = store;
window.setTeamCacheAuth = (user) => { auth = { ...auth, role: user ? 'team_leader' : null, user: user ? { id: user } : null }; listeners.forEach(callback => callback()); };
export function useFocusEffect(callback: () => void | (() => void)) { React.useEffect(callback, [callback]); }
export const teamLeaderPortalService = {
  getContext: async () => {
    const requestedUser = auth.user?.id;
    await new Promise(resolve => setTimeout(resolve, window.teamCacheFixture.contextDelay || 0));
    return requestedUser ? { assignment_id: `assignment-${requestedUser}`, parent_tenant_id: 'tenant', festival_id: 'festival', festival_team_id: `festival-team-${requestedUser}`, organisation_id: `team-${requestedUser}`, team_name: requestedUser } : null;
  },
};
