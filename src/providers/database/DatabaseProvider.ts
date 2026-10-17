export type QueryResult<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

export type ListResult<T> = {
  data: T[];
  error: { code?: string; message: string } | null;
};

export interface DatabaseProvider {
  getActiveFestival<T>(tenantId: string): Promise<QueryResult<T>>;
  getPointsConfig<T>(festivalId: string): Promise<QueryResult<T>>;
  upsertPointsConfig<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  upsertFestival<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  getActiveItemCodes(festivalId: string): Promise<ListResult<{ item_code: string }>>;
  getItems<T>(festivalId: string): Promise<ListResult<T>>;
  setActiveItemCodes(
    festivalId: string,
    tenantId: string,
    itemCodes: string[],
    itemRecords?: {
      item_code: string;
      item_name_ml: string;
      participation_type: string;
      category_codes: string[];
      duration_minutes?: number;
    }[]
  ): Promise<QueryResult<void>>;
  listParticipants<T>(): Promise<ListResult<T>>;
  getParticipant<T>(participantId: string): Promise<QueryResult<T>>;
  getPublicCandidateProfile<T>(slug: string): Promise<QueryResult<T>>;
  getParticipantRegistrations<T>(participantId: string): Promise<ListResult<T>>;
  getRegistrationsByItem<T>(itemId: string, tenantId: string, festivalId?: string): Promise<ListResult<T>>;
  getAdminRegistrationsBySchedule<T>(scheduleId: string): Promise<ListResult<T>>;
  listRegistrationsByFestival<T>(festivalId: string): Promise<ListResult<T>>;
  updateRegistration<T>(registrationId: string, updates: Record<string, unknown>): Promise<QueryResult<T>>;
  safeUnassignRegistration<T>(registrationId: string, reason?: string | null): Promise<QueryResult<T>>;
  updateParticipant<T>(participantId: string, updates: Record<string, unknown>): Promise<QueryResult<T>>;
  deleteParticipant(participantId: string): Promise<QueryResult<void>>;
  deleteParticipants(participantIds: string[]): Promise<QueryResult<void>>;
  updateParticipants(participantIds: string[], updates: Record<string, unknown>): Promise<QueryResult<void>>;
  countParticipantsByCategory(categoryCode: string, festivalId?: string): Promise<QueryResult<number>>;
  createParticipant<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  createParticipants<T>(payloads: Record<string, unknown>[]): Promise<ListResult<T>>;
  createRegistration<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  listParticipantDuplicateKeys(tenantId: string): Promise<ListResult<{ name: string | null; dob: string | null }>>;
  getTenantOrgType(tenantId: string): Promise<QueryResult<{ org_type: string | null }>>;
  listOrganisations<T>(tenantId: string): Promise<ListResult<T>>;
  getAdminDashboardStats(tenantId: string): Promise<QueryResult<{
    orgName: string;
    orgType: string;
    participantsCount: number;
    participantsLast7Days: number;
    itemsCount: number;
    pendingRegsCount: number;
    pendingRegsLast7Days: number;
    activeSchedulesCount: number;
    recentRegistrations: {
      id: string;
      participantName: string;
      itemName: string;
      organisationName: string;
      status: string;
      createdAt: string;
    }[];
  }>>;
  
  // Schedule & Venue Methods
  listVenues<T>(tenantId: string, festivalId?: string): Promise<ListResult<T>>;
  createVenue<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  updateVenue<T>(id: string, payload: Record<string, unknown>): Promise<QueryResult<T>>;
  deleteVenue(id: string): Promise<QueryResult<void>>;
  
  listSchedules<T>(tenantId: string, festivalId?: string): Promise<ListResult<T>>;
  createSchedule<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  createSchedules<T>(festivalId: string, payloads: Record<string, unknown>[]): Promise<ListResult<T>>;
  updateSchedule<T>(id: string, payload: Record<string, unknown>): Promise<QueryResult<T>>;
  deleteSchedule(id: string): Promise<QueryResult<void>>;

  // Code Letter Management Methods
  getParticipantConflicts(participantIds: string[], currentScheduleId: string, tenantId?: string): Promise<QueryResult<Record<string, Set<string>>>>;
  updateCodeLetter(registrationId: string, codeLetter: string): Promise<QueryResult<void>>;
  stageUpdateCodeLetter(scheduleId: string, registrationId: string, codeLetter: string): Promise<QueryResult<unknown>>;

  // Judge Methods
  listJudges<T>(tenantId: string): Promise<ListResult<T>>;
  createJudge<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  updateJudge<T>(id: string, payload: Record<string, unknown>): Promise<QueryResult<T>>;
  deleteJudge(id: string): Promise<QueryResult<void>>;
  listJudgeActivityLogs<T>(tenantId: string): Promise<ListResult<T>>;
  assignJudgesToSchedule(scheduleId: string, judgeIds: string[]): Promise<QueryResult<void>>;
  removeJudgeFromSchedule(scheduleId: string, judgeId: string, force?: boolean): Promise<QueryResult<void>>;
  getScheduleJudges<T>(scheduleId: string): Promise<ListResult<T>>;

  // Mark Entry Methods
  listMarkEntries<T>(scheduleId: string): Promise<ListResult<T>>;
  upsertMarkEntry<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  finalizeMarkEntry(markEntryId: string): Promise<QueryResult<void>>;
  unlockJudgeMarks(scheduleId: string, judgeId: string): Promise<QueryResult<void>>;
  unlockScheduleMarks(scheduleId: string): Promise<QueryResult<void>>;
  getRegistrationsBySchedule<T>(scheduleId: string): Promise<ListResult<T>>;
  getJudgeRegistrationsByToken<T>(token: string): Promise<ListResult<T>>;
  submitJudgeMark<T>(payload: {
    token: string;
    registrationId: string;
    criteriaScores: Record<string, number>;
    totalMark: number;
    status: 'draft' | 'final';
    entryMode?: 'criteria' | 'total_only';
    maxMark?: number;
    criteriaSnapshot?: { key: string; label: string; max: number }[];
  }): Promise<QueryResult<T>>;
  
  // Results Methods
  listResults<T>(scheduleId: string): Promise<ListResult<T>>;
  publishResults(payloads: Record<string, unknown>[]): Promise<QueryResult<void>>;
  listAdminLeaderboard<T>(tenantId?: string | null, festivalId?: string | null): Promise<ListResult<T>>;
  listPublicLeaderboard<T>(tenantId?: string | null, festivalId?: string | null): Promise<ListResult<T>>;
  listPublicPublishedResults<T>(tenantId?: string | null, festivalId?: string | null, includeParticipantDetails?: boolean): Promise<ListResult<T>>;
  getPublicLeaderboardSettings<T>(tenantId?: string | null, festivalId?: string | null): Promise<QueryResult<T>>;
  // Result Visibility Management
  listAdminPublishedResults<T>(tenantId?: string | null, festivalId?: string | null): Promise<ListResult<T>>;
  listFestivalResults<T>(tenantId?: string | null, festivalId?: string | null): Promise<ListResult<T>>;
  updateResultVisibility(resultId: string, status: 'draft' | 'ready' | 'published' | 'hidden' | 'archived'): Promise<QueryResult<void>>;
  bulkUpdateResultVisibility(resultIds: string[], status: 'draft' | 'ready' | 'published' | 'hidden' | 'archived'): Promise<QueryResult<void>>;

  // Judge Token Methods (One-Time Access)
  generateJudgeToken<T>(payload: { judgeId: string; scheduleId: string; tenantId: string; createdBy: string; forceRefresh?: boolean }): Promise<QueryResult<T>>;
  validateJudgeToken<T>(token: string): Promise<QueryResult<T>>;
  expireJudgeToken(token: string): Promise<QueryResult<void>>;
  listJudgeTokens<T>(scheduleId: string): Promise<ListResult<T>>;
  getJudgeSubmissionSummary<T>(scheduleId: string): Promise<ListResult<T>>;
  getScheduleReadiness<T>(scheduleId: string): Promise<ListResult<T>>;
  logJudgeActivity(payload: { judgeId: string; scheduleId: string; tenantId: string; actionType: string; actionDetails: Record<string, any>; token?: string }): Promise<QueryResult<void>>;


  // Leaderboard Settings & Poster Template Methods
  getLeaderboardSettings<T>(festivalId: string): Promise<QueryResult<T>>;
  upsertLeaderboardSettings<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  getPosterTemplates<T>(festivalId: string): Promise<ListResult<T>>;
  upsertPosterTemplate<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  deletePosterTemplate(templateId: string): Promise<QueryResult<void>>;
  saveGeneratedPoster<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;

  // Super Admin Methods
  getSuperAdminStats(): Promise<QueryResult<{ orgs: number; tenants: number }>>;
  listGlobalOrganisations<T>(): Promise<ListResult<T>>;
  createGlobalOrganisation<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  deleteGlobalOrganisation(id: string): Promise<QueryResult<void>>;
  listTenantAccounts<T>(): Promise<ListResult<T>>;
  revokeTenantAccess(orgId: string): Promise<QueryResult<void>>;
  disableTenantAccess(orgId: string, reason?: string): Promise<QueryResult<void>>;
  enableTenantAccess(orgId: string, reason?: string): Promise<QueryResult<void>>;
  getTenantLeaderboardAgentPrompt<T>(tenantId: string): Promise<QueryResult<T>>;

  // Bulk Unit Reassignment Methods
  previewBulkUnitAssignment(participantIds: string[], targetUnitId: string, tenantId: string): Promise<ListResult<any>>;
  executeBulkUnitAssignment(participantIds: string[], expectedHashes: string[], targetUnitId: string, batchId: string, tenantId: string): Promise<QueryResult<any>>;
  rollbackUnitAssignment(batchId: string): Promise<QueryResult<any>>;
  listParticipantUnitAuditLogs<T>(): Promise<ListResult<T>>;
  listParticipantUnitBatches<T>(tenantId: string): Promise<ListResult<T>>;
  createParticipantUnitBatch<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  updateParticipantUnitBatch<T>(id: string, updates: Record<string, unknown>): Promise<QueryResult<T>>;
  createSystemEvent<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;

  // Junior Dataset Import
  createImportSession<T>(payload: Record<string, unknown>): Promise<QueryResult<T>>;
  updateImportSession<T>(id: string, updates: Record<string, unknown>): Promise<QueryResult<T>>;
  executeJuniorImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>>;
  executeSeniorImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>>;
  executeUpperPrimaryImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>>;
  executeLpImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>>;
  executeHsImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>>;
  executeHssImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>>;
  executeGeneralImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>>;
  validateChestNumbers(festivalId: string, chestNumbers: string[]): Promise<ListResult<{ chest_number: string; name: string }>>;
}
