const MAX_AGE_MS = 60_000;
const MAX_CLOCK_SKEW_MS = 30_000;

export function readFreshPublicSnapshot<T extends {
  tenant_id: string;
  generated_at: string;
  expires_at: string;
}>(snapshot: T | undefined, tenantId: string | null | undefined, now = Date.now(), confirmedAt?: number): T | undefined {
  if (!snapshot || !tenantId || snapshot.tenant_id.toLowerCase() !== tenantId.toLowerCase()) return undefined;
  const created = Date.parse(snapshot.generated_at);
  const expires = Date.parse(snapshot.expires_at);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires > created + MAX_AGE_MS) return undefined;
  if (confirmedAt !== undefined && Number.isFinite(confirmedAt)) {
    return now >= confirmedAt - MAX_CLOCK_SKEW_MS && now < confirmedAt + MAX_AGE_MS ? snapshot : undefined;
  }
  return now >= created - MAX_CLOCK_SKEW_MS && now < expires ? snapshot : undefined;
}
