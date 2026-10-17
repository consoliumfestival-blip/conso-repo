import { festivalRepository } from '../lib/repositories/festivalRepository';

const notFoundCode = 'PGRST116';

const throwIfUnexpected = (error: { code?: string; message: string } | null) => {
  if (error && error.code !== notFoundCode) {
    throw new Error(error.message);
  }
};

export const festivalSettingsService = {
  async getActiveFestival<T>(tenantId: string): Promise<T | null> {
    const { data, error } = await festivalRepository.getActiveFestival<T>(tenantId);
    throwIfUnexpected(error);
    return data;
  },

  async getPointsConfig<T>(festivalId: string): Promise<T | null> {
    const { data, error } = await festivalRepository.getPointsConfig<T>(festivalId);
    throwIfUnexpected(error);
    return data;
  },

  async updatePointsConfig<T>(tenantId: string, payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await festivalRepository.upsertPointsConfig<T>({
      ...payload,
      tenant_id: tenantId,
    });

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Points configuration was not returned after update');
    return data;
  },

  async updateFestival<T>(tenantId: string, payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await festivalRepository.upsertFestival<T>({
      ...payload,
      tenant_id: tenantId,
      is_active: true,
    });

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Festival configuration was not returned after update');
    return data;
  },

  async getActiveItemCodes(festivalId: string): Promise<string[]> {
    const { data, error } = await festivalRepository.getActiveItemCodes(festivalId);
    if (error) throw new Error(error.message);
    return data.map((item) => item.item_code);
  },

  async getItems<T>(festivalId: string): Promise<T[]> {
    const { data, error } = await festivalRepository.getItems<T>(festivalId);
    if (error) throw new Error(error.message);
    return data;
  },

  async updateActiveItemCodes(
    festivalId: string,
    tenantId: string,
    selectedCodes: string[],
    itemRecords?: any[]
  ): Promise<void> {
    const { error } = await festivalRepository.setActiveItemCodes(
      festivalId,
      tenantId,
      selectedCodes,
      itemRecords
    );

    if (error) throw new Error(error.message);
  },
};
