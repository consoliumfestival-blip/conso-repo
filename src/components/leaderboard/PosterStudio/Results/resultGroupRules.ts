export interface PosterResultRow {
  result_id?: string;
  participant_id?: string | null;
  organisation_id?: string | null;
  rank: number | null;
  participant_name?: string | null;
  organisation_name?: string | null;
  grade?: string | null;
  points_awarded?: number | null;
  registration_id?: string | null;
}

export interface OfficialResultNumber {
  value: string;
  conflict: boolean;
}

export function resolvePublicOrder(value: number | undefined): OfficialResultNumber {
  if (value === undefined) return { value: '', conflict: false };
  if (!Number.isSafeInteger(value) || value < 1) return { value: '', conflict: true };
  return { value: String(value), conflict: false };
}

export function isPosterEligibleWinner(row: Pick<PosterResultRow, 'rank' | 'points_awarded'>): boolean {
  return row.rank !== null
    && row.rank >= 1
    && row.rank <= 5
    && typeof row.points_awarded === 'number'
    && row.points_awarded > 0;
}

export function getOfficialResultNumberLabel(
  officialNumber: OfficialResultNumber,
  publicVisible: boolean,
): string {
  if (officialNumber.conflict) return 'Conflicting official numbers';
  if (officialNumber.value) return `#${officialNumber.value}`;
  return publicVisible ? 'Official number missing' : 'Not public; number assigned on publish';
}

export function compareOfficialResultNumbers(
  left: OfficialResultNumber,
  right: OfficialResultNumber,
): number {
  const leftValue = !left.conflict && left.value ? Number(left.value) : null;
  const rightValue = !right.conflict && right.value ? Number(right.value) : null;
  if (leftValue !== null && rightValue !== null) return leftValue - rightValue;
  if (leftValue !== null) return -1;
  if (rightValue !== null) return 1;
  return 0;
}

export function buildRankVariables(rows: readonly PosterResultRow[]): Record<string, string> {
  const variables: Record<string, string> = {};

  for (let rank = 1; rank <= 5; rank += 1) {
    const winners = rows.filter((row) => row.rank === rank && isPosterEligibleWinner(row));
    variables[`name_${rank}`] = winners
      .map((winner) => (winner.participant_name || '').trim().toUpperCase())
      .join(' & ');
    variables[`unit_${rank}`] = winners.map((winner) => winner.organisation_name || '').join(' & ');
    variables[`grade_${rank}`] = winners[0]?.grade || '';
    variables[`points_${rank}`] = winners[0] ? String(winners[0].points_awarded) : '';
  }

  return variables;
}

/** Stable source marker for warning users when official result data changes after generation. */
export function fingerprintOfficialResults(rows: readonly PosterResultRow[], publicOrder?: number): string {
  const canonical = rows
    .map((row) => ({
      resultId: row.result_id ?? '',
      participantId: row.participant_id ?? '',
      organisationId: row.organisation_id ?? '',
      rank: row.rank,
      participantName: row.participant_name ?? '',
      organisationName: row.organisation_name ?? '',
      grade: row.grade ?? '',
      points: row.points_awarded ?? null,
      registrationId: row.registration_id ?? '',
    }))
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
      || a.resultId.localeCompare(b.resultId));
  return JSON.stringify({ rows: canonical, publicOrder: publicOrder ?? null });
}
