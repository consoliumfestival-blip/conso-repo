import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamLeaderProvider, useTeamLeaderContext } from '../../src/core/contexts/TeamLeaderContext';
import { useTeamReadQuery } from '../../src/core/hooks/useTeamReadQuery';

declare global { interface Window { teamCacheFixture: any; teamCacheClient: QueryClient; } }
window.teamCacheFixture = { contextDelay: 0, dataDelay: 0, fail: '' };
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.teamCacheClient = client;
function Reader() {
  const team = useTeamLeaderContext();
  const query = useTeamReadQuery('fixture', async () => {
    const value = team.context?.team_name;
    const fail = window.teamCacheFixture.fail;
    await new Promise(resolve => setTimeout(resolve, window.teamCacheFixture.dataDelay || 0));
    if (fail === 'auth') throw { code: '42501', message: 'access denied' };
    if (fail === 'offline') throw new Error('offline');
    return `data-${value}`;
  });
  return <main><div data-testid="context">{team.context?.team_name || 'none'}</div><div data-testid="value">{query.data ?? 'none'}</div><div data-testid="error">{team.error || (query.error as any)?.message || 'none'}</div><button onClick={() => void query.refetch()}>Refresh</button><button onClick={() => void team.refetch()}>Retry context</button></main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><TeamLeaderProvider><Reader /></TeamLeaderProvider></QueryClientProvider>);
