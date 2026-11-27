import type { PosterDeliveryScope, PosterDesignSnapshot } from '../Database/posterDesignSnapshot';

export type PosterSnapshotAccessMode = 'owner_only' | 'tenant_shared';

export function canAccessPosterSnapshot(
  snapshot: PosterDesignSnapshot,
  activeScope: PosterDeliveryScope,
  mode: PosterSnapshotAccessMode,
): boolean {
  if (snapshot.tenantId !== activeScope.tenantId || snapshot.festivalId !== activeScope.festivalId) {
    return false;
  }

  return mode === 'tenant_shared' || snapshot.userId === activeScope.userId;
}
