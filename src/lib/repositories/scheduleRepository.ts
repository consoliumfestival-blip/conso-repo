import { databaseProvider } from '../../providers/database';

export const scheduleRepository = {
  listVenues<T>(tenantId: string, festivalId?: string) {
    return databaseProvider.listVenues<T>(tenantId, festivalId);
  },

  createVenue<T>(payload: Record<string, unknown>) {
    return databaseProvider.createVenue<T>(payload);
  },

  updateVenue<T>(id: string, payload: Record<string, unknown>) {
    return databaseProvider.updateVenue<T>(id, payload);
  },

  deleteVenue(id: string) {
    return databaseProvider.deleteVenue(id);
  },

  listSchedules<T>(tenantId: string, festivalId?: string) {
    return databaseProvider.listSchedules<T>(tenantId, festivalId);
  },

  createSchedule<T>(payload: Record<string, unknown>) {
    return databaseProvider.createSchedule<T>(payload);
  },

  createSchedules<T>(festivalId: string, payloads: Record<string, unknown>[]) {
    return databaseProvider.createSchedules<T>(festivalId, payloads);
  },

  updateSchedule<T>(id: string, payload: Record<string, unknown>) {
    return databaseProvider.updateSchedule<T>(id, payload);
  },

  updateScheduleAssignment<T>(scheduleId: string, venueId: string | null, updateSubstages: boolean, substageConfig: unknown) {
    return databaseProvider.updateScheduleAssignment<T>(scheduleId, venueId, updateSubstages, substageConfig);
  },

  deleteSchedule(id: string) {
    return databaseProvider.deleteSchedule(id);
  },
};
