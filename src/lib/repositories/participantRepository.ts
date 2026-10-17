import { databaseProvider } from '../../providers/database';

export const participantRepository = {
  listParticipants<T>() {
    return databaseProvider.listParticipants<T>();
  },

  getParticipant<T>(participantId: string) {
    return databaseProvider.getParticipant<T>(participantId);
  },

  getPublicCandidateProfile<T>(slug: string) {
    return databaseProvider.getPublicCandidateProfile<T>(slug);
  },

  getParticipantRegistrations<T>(participantId: string) {
    return databaseProvider.getParticipantRegistrations<T>(participantId);
  },

  getRegistrationsByItem<T>(itemId: string, tenantId: string, festivalId?: string) {
    return databaseProvider.getRegistrationsByItem<T>(itemId, tenantId, festivalId);
  },
  getAdminRegistrationsBySchedule<T>(scheduleId: string) {
    return databaseProvider.getAdminRegistrationsBySchedule<T>(scheduleId);
  },

  listRegistrationsByFestival<T>(festivalId: string) {
    return databaseProvider.listRegistrationsByFestival<T>(festivalId);
  },

  updateRegistration<T>(registrationId: string, updates: Record<string, unknown>) {
    return databaseProvider.updateRegistration<T>(registrationId, updates);
  },

  safeUnassignRegistration<T>(registrationId: string, reason?: string | null) {
    return databaseProvider.safeUnassignRegistration<T>(registrationId, reason);
  },

  getParticipantConflicts(participantIds: string[], currentScheduleId: string, tenantId?: string) {
    return databaseProvider.getParticipantConflicts(participantIds, currentScheduleId, tenantId);
  },

  updateCodeLetter(registrationId: string, codeLetter: string) {
    return databaseProvider.updateCodeLetter(registrationId, codeLetter);
  },

  stageUpdateCodeLetter(scheduleId: string, registrationId: string, codeLetter: string) {
    return databaseProvider.stageUpdateCodeLetter(scheduleId, registrationId, codeLetter);
  },

  updateParticipant<T>(participantId: string, updates: Record<string, unknown>) {
    return databaseProvider.updateParticipant<T>(participantId, updates);
  },

  deleteParticipant(participantId: string) {
    return databaseProvider.deleteParticipant(participantId);
  },

  terminateParticipant(participantId: string, reason: string) {
    return databaseProvider.terminateParticipant(participantId, reason);
  },

  revokeTermination(participantId: string) {
    return databaseProvider.revokeTermination(participantId);
  },

  deleteParticipants(participantIds: string[]) {
    return databaseProvider.deleteParticipants(participantIds);
  },

  updateParticipants(participantIds: string[], updates: Record<string, unknown>) {
    return databaseProvider.updateParticipants(participantIds, updates);
  },

  countParticipantsByCategory(categoryCode: string, festivalId?: string) {
    return databaseProvider.countParticipantsByCategory(categoryCode, festivalId);
  },

  validateChestNumbers(festivalId: string, chestNumbers: string[]) {
    return databaseProvider.validateChestNumbers(festivalId, chestNumbers);
  },

  createParticipant<T>(payload: Record<string, unknown>) {
    return databaseProvider.createParticipant<T>(payload);
  },

  createParticipants<T>(payloads: Record<string, unknown>[]) {
    return databaseProvider.createParticipants<T>(payloads);
  },

  createRegistration<T>(payload: Record<string, unknown>) {
    return databaseProvider.createRegistration<T>(payload);
  },

  listParticipantDuplicateKeys(tenantId: string) {
    return databaseProvider.listParticipantDuplicateKeys(tenantId);
  },

  getTenantOrgType(tenantId: string) {
    return databaseProvider.getTenantOrgType(tenantId);
  },

  listOrganisations<T>(tenantId: string) {
    return databaseProvider.listOrganisations<T>(tenantId);
  },

  previewBulkUnitAssignment(participantIds: string[], targetUnitId: string, tenantId: string) {
    return databaseProvider.previewBulkUnitAssignment(participantIds, targetUnitId, tenantId);
  },

  executeBulkUnitAssignment(participantIds: string[], expectedHashes: string[], targetUnitId: string, batchId: string, tenantId: string) {
    return databaseProvider.executeBulkUnitAssignment(participantIds, expectedHashes, targetUnitId, batchId, tenantId);
  },

  rollbackUnitAssignment(batchId: string) {
    return databaseProvider.rollbackUnitAssignment(batchId);
  },

  listParticipantUnitAuditLogs<T>() {
    return databaseProvider.listParticipantUnitAuditLogs<T>();
  },

  listParticipantUnitBatches<T>(tenantId: string) {
    return databaseProvider.listParticipantUnitBatches<T>(tenantId);
  },

  createParticipantUnitBatch<T>(payload: Record<string, unknown>) {
    return databaseProvider.createParticipantUnitBatch<T>(payload);
  },

  updateParticipantUnitBatch<T>(id: string, updates: Record<string, unknown>) {
    return databaseProvider.updateParticipantUnitBatch<T>(id, updates);
  },

  createSystemEvent<T>(payload: Record<string, unknown>) {
    return databaseProvider.createSystemEvent<T>(payload);
  },
};
