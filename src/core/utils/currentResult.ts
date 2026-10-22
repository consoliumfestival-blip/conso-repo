type ResultVersion = { published_at?: string | null; result_id?: string | null };

// A correction may reduce points. Never choose a version by its award value.
export function isNewerResult(candidate: ResultVersion, previous: ResultVersion): boolean {
  const time = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
  const next = time(candidate.published_at), old = time(previous.published_at);
  return next > old || (next === old && String(candidate.result_id ?? '') > String(previous.result_id ?? ''));
}
