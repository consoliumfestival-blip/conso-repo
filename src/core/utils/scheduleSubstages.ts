export type ChestRange = { from: number | string; to: number | string };
export type ScheduleSubstage = { id: string; name: string; ranges: ChestRange[] };

export function chestNumberValue(value: string | number | null | undefined): number | null {
  const text = String(value ?? '').trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}

export function validateSubstages(stages: ScheduleSubstage[]): string | null {
  const allRanges: ChestRange[] = [];
  const ids = new Set<string>();
  for (const stage of stages) {
    if (!stage.id || ids.has(stage.id) || !stage.name.trim() || !stage.ranges.length) {
      return 'Each sub-stage needs a unique ID, name, and at least one chest-number range.';
    }
    ids.add(stage.id);
    for (const range of stage.ranges) {
      const from = chestNumberValue(range.from);
      const to = chestNumberValue(range.to);
      if (from === null || to === null || to < from) {
        return 'Enter valid whole-number chest ranges with the start no greater than the end.';
      }
      allRanges.push({ from, to });
    }
  }
  allRanges.sort((a, b) => Number(a.from) - Number(b.from));
  for (let index = 1; index < allRanges.length; index += 1) {
    if (Number(allRanges[index].from) <= Number(allRanges[index - 1].to)) {
      return 'Chest-number ranges cannot overlap, even across different sub-stages.';
    }
  }
  return null;
}

export function substageForChest(stages: ScheduleSubstage[], value: string | number | null | undefined): ScheduleSubstage | null {
  const chest = chestNumberValue(value);
  if (chest === null) return null;
  return stages.find((stage) => stage.ranges.some((range) => chest >= Number(range.from) && chest <= Number(range.to))) ?? null;
}

export function normalizedSubstages(stages: ScheduleSubstage[]): ScheduleSubstage[] {
  return stages.map((stage) => ({ ...stage, name: stage.name.trim(), ranges: stage.ranges.map((range) => ({
    from: Number(range.from), to: Number(range.to),
  })) }));
}

type CategoryItem = { id: string; category_codes?: string[] | null; participation_type?: string | null };
type ConfiguredSchedule = { item_id: string; substage_config?: ScheduleSubstage[] | null; substage_config_updated_at?: string | null };

export function supportsSubstages(item: CategoryItem | null | undefined): boolean {
  const codes = item?.category_codes ?? [];
  return !!item && item.participation_type?.toLowerCase() === 'individual'
    && codes.length === 1 && !['GN', 'GENERAL'].includes(codes[0].trim().toUpperCase());
}

export function categorySubstageDefault(
  schedules: ConfiguredSchedule[], items: CategoryItem[], item: CategoryItem,
): ScheduleSubstage[] {
  if (!supportsSubstages(item)) return [];
  const category = item.category_codes![0].trim().toUpperCase();
  const candidates = schedules.filter((schedule) => {
    const scheduledItem = items.find((other) => other.id === schedule.item_id);
    return supportsSubstages(scheduledItem)
      && scheduledItem!.category_codes![0].trim().toUpperCase() === category
      && !!schedule.substage_config_updated_at
      && !!schedule.substage_config?.length;
  });
  candidates.sort((a, b) => (b.substage_config_updated_at ?? '').localeCompare(a.substage_config_updated_at ?? ''));
  return (candidates[0]?.substage_config ?? []).map((stage) => ({
    ...stage,
    ranges: stage.ranges.map((range) => ({ ...range })),
  }));
}
