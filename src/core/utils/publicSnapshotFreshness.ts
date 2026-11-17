const MAX_AGE_MS = 60_000;

export function readFreshPublicSnapshot<T extends {
  tenant_id: string;
  generated_at: string;
  expires_at: string;
}>(snapshot: T | undefined, tenantId: string | null | undefined, now = Date.now(), confirmedAt?: number): T | undefined {
  if (!snapshot || !tenantId || snapshot.tenant_id.toLowerCase() !== tenantId.toLowerCase()) return undefined;
  const created = Date.parse(snapshot.generated_at);
  const expires = Date.parse(snapshot.expires_at);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires > created + MAX_AGE_MS) return undefined;
  const leaseUntil = confirmedAt && confirmedAt >= created ? confirmedAt + MAX_AGE_MS : expires;
  return now >= created && now < leaseUntil ? snapshot : undefined;
}
