import { isGeneralCategoryCode } from './generalCategory';

type GroupItem = { participation_type?: string | null; category_codes?: string[] | string | null };

export const isGroupCompetition = (item?: GroupItem | null) =>
  item?.participation_type?.trim().toLowerCase() === 'group';

const aliases: Record<string, string> = { JUNIOR: 'JR', SENIOR: 'SR', CAMPUS: 'CA' };
const category = (value: string) => aliases[value.trim().toUpperCase()] || value.trim().toUpperCase();

export function matchesCompetitionCategory(participantCategory: string, itemCategory: string, postHsReligious = false) {
  const target = category(itemCategory);
  if (postHsReligious && target === 'HS') return false;
  return isGeneralCategoryCode(target) || category(participantCategory) === target
    || (postHsReligious && ['JR', 'SR'].includes(target));
}

export function groupEntryChest(entry: { leader?: { chest_number?: string | null } | null; entry_chest_number?: string | null }) {
  return entry.leader?.chest_number || entry.entry_chest_number || '';
}

export function programIntakeComplete(rows: { item_id: string; category_code: string; entry_kind: string; is_complete: boolean }[], itemId: string, itemCategory: string, kind: string) {
  const matching = rows.filter(row => row.item_id === itemId && row.category_code.toUpperCase() === itemCategory.toUpperCase());
  const current = matching.find(row => row.entry_kind === kind);
  if (current) return current.is_complete;
  return kind === 'general_team' && (matching.find(row => row.entry_kind === 'participant')?.is_complete ?? false);
}
