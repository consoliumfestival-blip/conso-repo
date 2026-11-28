import type { PublicCandidateSearchItem } from '../../providers/database/DatabaseProvider';

export interface DualSearchSourceInput {
  tenantId: string;
  festivalName: string;
  items: PublicCandidateSearchItem[];
}

export interface MergedCandidateSearchResult {
  tenantId: string;
  festivalName: string;
  candidate: PublicCandidateSearchItem;
  sourceOrder: number;
}

type MatchScore = {
  tier: number;
  matchPos: number;
  chestLen: number;
  numericDistance: number;
  chestNum: number;
};

function parsePositiveIntOrInfinity(raw: string): number {
  if (!raw || !/^\d+$/.test(raw)) return Number.POSITIVE_INFINITY;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function getWordPrefixMatchIndex(name: string, query: string): number {
  if (!name || !query) return -1;
  const words = name.split(/[\s._-]+/);
  for (let i = 0; i < words.length; i += 1) {
    if (words[i].startsWith(query)) return i;
  }
  return -1;
}

function scoreCandidateMatch(candidate: PublicCandidateSearchItem, rawQuery: string): MatchScore {
  const q = rawQuery.trim().toLowerCase();
  const chest = (candidate.chest_number || '').trim().toLowerCase();
  const name = (candidate.name || '').trim().toLowerCase();
  const qNum = parsePositiveIntOrInfinity(q);
  const chestNum = parsePositiveIntOrInfinity(chest);
  const numericDistance =
    Number.isFinite(qNum) && Number.isFinite(chestNum)
      ? Math.abs(chestNum - qNum)
      : Number.POSITIVE_INFINITY;
  const chestLen = chest ? chest.length : Number.POSITIVE_INFINITY;

  if (!q) {
    return { tier: 7, matchPos: 0, chestLen, numericDistance, chestNum };
  }

  // Exact chest match first (string equality or normalized integer equality)
  if (chest && (chest === q || (Number.isFinite(qNum) && chestNum === qNum))) {
    return { tier: 0, matchPos: 0, chestLen, numericDistance: 0, chestNum };
  }

  // Exact full name match next
  if (name && name === q) {
    return { tier: 1, matchPos: 0, chestLen, numericDistance, chestNum };
  }

  // Chest prefix match (e.g. "13" -> "130", "1300" before "2130")
  if (chest && chest.startsWith(q)) {
    return { tier: 2, matchPos: 0, chestLen, numericDistance, chestNum };
  }

  // Full name prefix match
  if (name && name.startsWith(q)) {
    return { tier: 3, matchPos: 0, chestLen, numericDistance, chestNum };
  }

  // Name word-boundary prefix match
  const wordPos = getWordPrefixMatchIndex(name, q);
  if (wordPos >= 0) {
    return { tier: 4, matchPos: wordPos, chestLen, numericDistance, chestNum };
  }

  // Substring match in chest number (earlier offset and closer number first)
  if (chest) {
    const chestPos = chest.indexOf(q);
    if (chestPos >= 0) {
      return { tier: 5, matchPos: chestPos, chestLen, numericDistance, chestNum };
    }
  }

  // Substring match in candidate name
  if (name) {
    const namePos = name.indexOf(q);
    if (namePos >= 0) {
      return { tier: 6, matchPos: namePos, chestLen, numericDistance, chestNum };
    }
  }

  return { tier: 7, matchPos: Number.POSITIVE_INFINITY, chestLen, numericDistance, chestNum };
}

function compareScores(
  aScore: MatchScore,
  bScore: MatchScore,
  aCandidate: PublicCandidateSearchItem,
  bCandidate: PublicCandidateSearchItem,
  aOrder: number,
  bOrder: number,
): number {
  if (aScore.tier !== bScore.tier) return aScore.tier - bScore.tier;
  if (aScore.matchPos !== bScore.matchPos) return aScore.matchPos - bScore.matchPos;

  // For chest-focused tiers, prefer shorter chest lengths & closer numeric matches first
  if (aScore.tier === 0 || aScore.tier === 2 || aScore.tier === 5) {
    if (aScore.chestLen !== bScore.chestLen) return aScore.chestLen - bScore.chestLen;
    if (aScore.numericDistance !== bScore.numericDistance) {
      return aScore.numericDistance - bScore.numericDistance;
    }
    if (aScore.chestNum !== bScore.chestNum) return aScore.chestNum - bScore.chestNum;
    const chestCmp = (aCandidate.chest_number || '').localeCompare(bCandidate.chest_number || '');
    if (chestCmp !== 0) return chestCmp;
  }

  const nameCmp = (aCandidate.name || '').localeCompare(bCandidate.name || '');
  if (nameCmp !== 0) return nameCmp;

  if (aScore.chestNum !== bScore.chestNum) return aScore.chestNum - bScore.chestNum;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return (aCandidate.slug || '').localeCompare(bCandidate.slug || '');
}

/**
 * Sorts a single festival's candidate search hits so closest chest/name matches appear first.
 */
export function sortCandidatesByRelevance(
  items: PublicCandidateSearchItem[],
  query: string,
): PublicCandidateSearchItem[] {
  if (!query.trim() || items.length <= 1) return items;
  return [...items]
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreCandidateMatch(candidate, query),
    }))
    .sort((a, b) => compareScores(a.score, b.score, a.candidate, b.candidate, a.index, b.index))
    .map((entry) => entry.candidate);
}

/**
 * Combines tenant-isolated candidate results for the frontend UI without separate group cards,
 * deduplicating per-tenant slugs and ordering closest query/chest-number matches first.
 */
export function mergeAndSortDualCandidates(
  sources: DualSearchSourceInput[],
  query: string,
): MergedCandidateSearchResult[] {
  const seen = new Set<string>();
  const combined: Array<MergedCandidateSearchResult & { score: MatchScore }> = [];

  sources.forEach((source, sourceOrder) => {
    for (const candidate of source.items) {
      if (!candidate?.slug) continue;
      const key = `${source.tenantId}:${candidate.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push({
        tenantId: source.tenantId,
        festivalName: source.festivalName,
        candidate,
        sourceOrder,
        score: scoreCandidateMatch(candidate, query),
      });
    }
  });

  combined.sort((a, b) =>
    compareScores(a.score, b.score, a.candidate, b.candidate, a.sourceOrder, b.sourceOrder),
  );

  return combined.map(({ tenantId, festivalName, candidate, sourceOrder }) => ({
    tenantId,
    festivalName,
    candidate,
    sourceOrder,
  }));
}
