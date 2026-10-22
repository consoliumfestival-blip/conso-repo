import { databaseProvider } from '../../providers/database';
import type { CompetitionItemUpdate } from '../../providers/database/DatabaseProvider';

export const festivalRepository = {
  async getActiveFestival<T>(tenantId: string) {
    return databaseProvider.getActiveFestival<T>(tenantId);
  },

  async getPointsConfig<T>(festivalId: string) {
    return databaseProvider.getPointsConfig<T>(festivalId);
  },

  async upsertPointsConfig<T>(payload: Record<string, unknown>) {
    return databaseProvider.upsertPointsConfig<T>(payload);
  },

  async upsertFestival<T>(payload: Record<string, unknown>) {
    return databaseProvider.upsertFestival<T>(payload);
  },

  async getActiveItemCodes(festivalId: string) {
    return databaseProvider.getActiveItemCodes(festivalId);
  },

  getItems<T>(festivalId: string) {
    return databaseProvider.getItems<T>(festivalId);
  },

  getSelectableItems<T>(festivalId: string, tenantId: string) {
    return databaseProvider.getSelectableItems<T>(festivalId, tenantId);
  },

  updateCompetitionItem(input: CompetitionItemUpdate) {
    return databaseProvider.updateCompetitionItem(input);
  },

  applyItemChanges(
    festivalId: string,
    activateCodes: string[],
    deactivateCodes: string[],
    itemRecords?: any[],
  ) {
    return databaseProvider.applyItemChanges(festivalId, activateCodes, deactivateCodes, itemRecords);
  },

  async setActiveItemCodes(
    festivalId: string, 
    tenantId: string, 
    itemCodes: string[],
    itemRecords?: any[]
  ) {
    return databaseProvider.setActiveItemCodes(festivalId, tenantId, itemCodes, itemRecords);
  },
};
