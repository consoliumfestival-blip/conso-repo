import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { LeaderboardRow, PublicPublishedResultRow } from '../../services/leaderboardService';
import type { PublicLeaderboardSettings } from '../../services/leaderboardSettingsService';
import { readFreshPublicSnapshot } from '../utils/publicSnapshotFreshness';

export type PublicSnapshot = {
  tenant_id: string;
  festival_id: string | null;
  revision: string | null;
  generated_at: string;
  expires_at: string;
  features: {
    public_page: boolean;
    public_leaderboard: boolean;
    sections: { schedule: boolean; results: boolean; participant_results: boolean; media: boolean };
  };
  settings: PublicLeaderboardSettings | null;
  leaderboard: LeaderboardRow[];
  results: PublicPublishedResultRow[];
  participant_results: PublicPublishedResultRow[];
  schedules: any[];
};

type PublicVersion = { tenant_id: string; revision: string | null; confirmed_at: number };
const MAX_AGE_MS = 60_000;

async function fetchPublicVersion(tenantId: string, signal?: AbortSignal): Promise<PublicVersion> {
  const response = await fetch(`/api/public-version?tenant_id=${encodeURIComponent(tenantId)}`, {
    cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new Error(`Public version returned ${response.status}`);
  const data = await response.json();
  const checkedAt = Date.parse(data.checked_at);
  const confirmedAt = Date.now();
  if (data.tenant_id !== tenantId ||
      !(data.revision === null || (typeof data.revision === 'string' && /^(0|[1-9][0-9]*)$/.test(data.revision))) ||
      !Number.isFinite(checkedAt)) {
    throw new Error('Invalid public version');
  }
  return { tenant_id: tenantId, revision: data.revision, confirmed_at: confirmedAt };
}

async function fetchPublicSnapshot(tenantId: string, revision: string | null, signal?: AbortSignal): Promise<PublicSnapshot> {
  const response = await fetch(`/api/public-snapshot?tenant_id=${encodeURIComponent(tenantId)}`, {
    cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new Error(`Public snapshot returned ${response.status}`);
  const snapshot = await response.json() as PublicSnapshot;
  const receivedAt = Date.now();
  if (snapshot.revision !== revision || !readFreshPublicSnapshot(snapshot, tenantId, receivedAt, receivedAt)) {
    throw new Error('Public snapshot version is stale or invalid');
  }
  return snapshot;
}

export function usePublicSnapshot(tenantId?: string | null, enabled = true) {
  const active = Platform.OS === 'web' && enabled && !!tenantId;
  const [expiryTick, setExpiryTick] = useState(0);
  const version = useQuery({
    queryKey: ['public-snapshot-version', tenantId],
    queryFn: ({ signal }) => fetchPublicVersion(tenantId!, signal),
    enabled: active,
    staleTime: 0,
    gcTime: MAX_AGE_MS,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });
  const query = useQuery({
    queryKey: ['public-snapshot', tenantId, version.data?.revision],
    queryFn: ({ signal }) => fetchPublicSnapshot(tenantId!, version.data!.revision, signal),
    enabled: active && !!version.data,
    staleTime: Infinity,
    gcTime: MAX_AGE_MS,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  useEffect(() => {
    if (!version.data) return;
    const delay = version.data.confirmed_at + MAX_AGE_MS - Date.now();
    if (delay <= 0) { setExpiryTick((tick) => tick + 1); return; }
    const timer = setTimeout(() => setExpiryTick((tick) => tick + 1), delay + 1);
    return () => clearTimeout(timer);
  }, [version.data]);

  void expiryTick;
  const matching = query.data?.revision === version.data?.revision;
  // Keep the visible rows mounted during a changed-version fetch. If that
  // fetch fails, the old revision is dropped immediately.
  const data = matching || query.isFetching
    ? readFreshPublicSnapshot(query.data, tenantId, Date.now(), version.data?.confirmed_at)
    : undefined;
  const hasError = version.isError || query.isError;
  return {
    ...query,
    data,
    isLoading: active && !hasError && (!version.data || query.isLoading || !data),
    isError: hasError,
    error: version.error ?? query.error,
    isRefetching: version.isFetching || query.isFetching,
    refetch: async () => {
      const ver = await version.refetch();
      if (ver.data) return query.refetch();
      return ver;
    },
  };
}
