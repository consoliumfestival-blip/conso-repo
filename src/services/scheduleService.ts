import { scheduleRepository } from '../lib/repositories/scheduleRepository';

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export const scheduleService = {
  // Venues
  async listVenues<T>(tenantId: string, festivalId?: string): Promise<T[]> {
    const { data, error } = await scheduleRepository.listVenues<T>(tenantId, festivalId);
    throwIfError(error);
    return data;
  },

  async createVenue<T>(tenantId: string, payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await scheduleRepository.createVenue<T>({ ...payload, tenant_id: tenantId });
    throwIfError(error);
    if (!data) throw new Error('Venue not returned after creation');
    return data;
  },

  async updateVenue<T>(id: string, payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await scheduleRepository.updateVenue<T>(id, payload);
    throwIfError(error);
    if (!data) throw new Error('Venue not returned after update');
    return data;
  },

  async deleteVenue(id: string): Promise<void> {
    const { error } = await scheduleRepository.deleteVenue(id);
    throwIfError(error);
  },

  // Schedules
  async listSchedules<T>(tenantId: string, festivalId?: string): Promise<T[]> {
    const { data, error } = await scheduleRepository.listSchedules<T>(tenantId, festivalId);
    throwIfError(error);
    return data;
  },

  async createSchedule<T>(tenantId: string, payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await scheduleRepository.createSchedule<T>({ ...payload, tenant_id: tenantId });
    throwIfError(error);
    if (!data) throw new Error('Schedule not returned after creation');
    return data;
  },

  async createSchedules<T>(tenantId: string, festivalId: string, payloads: Record<string, unknown>[]): Promise<T[]> {
    if (!payloads.length) return [];
    const { data, error } = await scheduleRepository.createSchedules<T>(festivalId, payloads.map((payload) => ({
      ...payload,
      tenant_id: tenantId,
      festival_id: festivalId,
    })));
    throwIfError(error);
    return data;
  },

  async updateSchedule<T>(id: string, payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await scheduleRepository.updateSchedule<T>(id, payload);
    throwIfError(error);
    if (!data) throw new Error('Schedule not returned after update');
    return data;
  },

  async deleteSchedule(id: string): Promise<void> {
    const { error } = await scheduleRepository.deleteSchedule(id);
    throwIfError(error);
  },
};
