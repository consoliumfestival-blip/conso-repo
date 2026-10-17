import { databaseProvider } from '../../providers/database';

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

  async setActiveItemCodes(
    festivalId: string, 
    tenantId: string, 
    itemCodes: string[],
    itemRecords?: any[]
  ) {
    return databaseProvider.setActiveItemCodes(festivalId, tenantId, itemCodes, itemRecords);
  },
};
