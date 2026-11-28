import { useEffect, useMemo, useState } from 'react';
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
const GC_RETENTION_MS = 10 * 60_000;

function readCachedBrowserSnapshot(tenantId?: string | null): PublicSnapshot | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !tenantId) return undefined;
  try {
    const raw = window.localStorage.getItem(`conso_pub_snap_v2:${tenantId}:active`)
      ?? window.sessionStorage.getItem(`conso_pub_snap_v2:${tenantId}:active`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { data?: PublicSnapshot };
    const snap = parsed?.data;
    if (!snap || snap.tenant_id?.toLowerCase() !== tenantId.toLowerCase() || !snap.features) return undefined;
    return snap;
  } catch {
    return undefined;
  }
}

function writeCachedBrowserSnapshot(tenantId: string, snapshot: PublicSnapshot) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    if (snapshot.revision && snapshot.features?.public_page === true) {
      window.localStorage.setItem(`conso_pub_snap_v2:${tenantId}:active`, JSON.stringify({ data: snapshot }));
    }
  } catch {
    // ignore storage errors
  }
}

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

async function fetchPublicSnapshot(tenantId: string, expectedRevision: string | null | undefined, signal?: AbortSignal): Promise<PublicSnapshot> {
  const response = await fetch(`/api/public-snapshot?tenant_id=${encodeURIComponent(tenantId)}`, {
    cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new Error(`Public snapshot returned ${response.status}`);
  const snapshot = await response.json() as PublicSnapshot;
  const receivedAt = Date.now();
  if ((expectedRevision !== undefined && snapshot.revision !== expectedRevision)
      || !readFreshPublicSnapshot(snapshot, tenantId, receivedAt, receivedAt)) {
    throw new Error('Public snapshot version is stale or invalid');
  }
  writeCachedBrowserSnapshot(tenantId, snapshot);
  return snapshot;
}

export function usePublicSnapshot(tenantId?: string | null, enabled = true) {
  const active = Platform.OS === 'web' && enabled && !!tenantId;
  const cachedSnap = useMemo(() => (active ? readCachedBrowserSnapshot(tenantId) : undefined), [active, tenantId]);
  const [expiryTick, setExpiryTick] = useState(0);
  const version = useQuery({
    queryKey: ['public-snapshot-version', tenantId],
    queryFn: ({ signal }) => fetchPublicVersion(tenantId!, signal),
    enabled: active,
    initialData: cachedSnap
      ? { tenant_id: tenantId!, revision: cachedSnap.revision ?? null, confirmed_at: Date.now() }
      : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    gcTime: GC_RETENTION_MS,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });
  const targetRevision = version.data?.revision;
  const query = useQuery({
    queryKey: ['public-snapshot', tenantId, targetRevision ?? 'boot'],
    queryFn: ({ signal }) => fetchPublicSnapshot(tenantId!, targetRevision, signal),
    enabled: active,
    initialData: cachedSnap && (targetRevision === undefined || cachedSnap.revision === targetRevision)
      ? cachedSnap
      : undefined,
    staleTime: Infinity,
    gcTime: GC_RETENTION_MS,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  useEffect(() => {
    const baseTime = version.data?.confirmed_at ?? (query.dataUpdatedAt || undefined);
    if (!baseTime) return;
    const delay = baseTime + MAX_AGE_MS - Date.now();
    if (delay <= 0) {
      setExpiryTick((tick) => tick + 1);
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void version.refetch();
      }
      return;
    }
    const timer = setTimeout(() => {
      setExpiryTick((tick) => tick + 1);
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void version.refetch();
      }
    }, delay + 1);
    return () => clearTimeout(timer);
  }, [version.data, query.dataUpdatedAt, version]);

  void expiryTick;
  const matching = !version.data || query.data?.revision === version.data?.revision;
  const effectiveConfirmedAt = version.data?.confirmed_at ?? (query.dataUpdatedAt || undefined);
  const hasLiveConfirmation = version.dataUpdatedAt > 0 || query.dataUpdatedAt > 0;
  // Keep the visible rows mounted during a changed-version fetch or while a
  // live-confirmed session refreshes in the background instead of blanking out
  // after 60s of tab inactivity.
  const freshData = readFreshPublicSnapshot(query.data, tenantId, Date.now(), effectiveConfirmedAt);
  const data = matching || query.isFetching
    ? (freshData ?? (hasLiveConfirmation && matching && query.data?.tenant_id?.toLowerCase() === tenantId?.toLowerCase()
      ? query.data
      : undefined))
    : undefined;
  const hasError = query.isError || (version.isError && !query.data);
  return {
    ...query,
    data,
    isLoading: active && !hasError && (!data || query.isLoading),
    isError: hasError,
    error: query.error ?? version.error,
    isRefetching: version.isFetching || query.isFetching,
    refetch: async () => {
      const ver = await version.refetch();
      if (ver.data) return query.refetch();
      return ver;
    },
  };
}
