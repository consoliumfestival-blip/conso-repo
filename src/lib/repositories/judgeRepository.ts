import { databaseProvider } from '../../providers/database';

export const judgeRepository = {
  async listJudges<T>(tenantId: string) {
    return databaseProvider.listJudges<T>(tenantId);
  },
  async createJudge<T>(payload: Record<string, unknown>) {
    return databaseProvider.createJudge<T>(payload);
  },
  async updateJudge<T>(id: string, payload: Record<string, unknown>) {
    return databaseProvider.updateJudge<T>(id, payload);
  },
  async deleteJudge(id: string) {
    return databaseProvider.deleteJudge(id);
  },
  async listJudgeActivityLogs<T>(tenantId: string) {
    return databaseProvider.listJudgeActivityLogs<T>(tenantId);
  },
  async assignJudgesToSchedule(scheduleId: string, judgeIds: string[]) {
    return databaseProvider.assignJudgesToSchedule(scheduleId, judgeIds);
  },
  async removeJudgeFromSchedule(scheduleId: string, judgeId: string, force = false) {
    return databaseProvider.removeJudgeFromSchedule(scheduleId, judgeId, force);
  },
  async getScheduleJudges<T>(scheduleId: string) {
    return databaseProvider.getScheduleJudges<T>(scheduleId);
  },
  async getRegistrationsBySchedule<T>(scheduleId: string) {
    return databaseProvider.getRegistrationsBySchedule<T>(scheduleId);
  },
  async getJudgeRegistrationsByToken<T>(token: string) {
    return databaseProvider.getJudgeRegistrationsByToken<T>(token);
  },
  async submitJudgeMark<T>(payload: {
    token: string;
    registrationId: string;
    criteriaScores: Record<string, number>;
    totalMark: number;
    status: 'draft' | 'final';
    entryMode?: 'criteria' | 'total_only';
    maxMark?: number;
    criteriaSnapshot?: { key: string; label: string; max: number }[];
  }) {
    return databaseProvider.submitJudgeMark<T>(payload);
  },
  async listMarkEntries<T>(scheduleId: string) {
    return databaseProvider.listMarkEntries<T>(scheduleId);
  },
  async upsertMarkEntry<T>(payload: Record<string, unknown>) {
    return databaseProvider.upsertMarkEntry<T>(payload);
  },
  async finalizeMarkEntry(markEntryId: string) {
    return databaseProvider.finalizeMarkEntry(markEntryId);
  },
  async unlockJudgeMarks(scheduleId: string, judgeId: string) {
    return databaseProvider.unlockJudgeMarks(scheduleId, judgeId);
  },
  async unlockScheduleMarks(scheduleId: string) {
    return databaseProvider.unlockScheduleMarks(scheduleId);
  },
  async listResults<T>(scheduleId: string) {
    return databaseProvider.listResults<T>(scheduleId);
  },
  async publishResults(payloads: Record<string, unknown>[]) {
    return databaseProvider.publishResults(payloads);
  },
  async getJudgeSubmissionSummary<T>(scheduleId: string) {
    return databaseProvider.getJudgeSubmissionSummary<T>(scheduleId);
  },
  async getScheduleReadiness<T>(scheduleId: string) {
    return databaseProvider.getScheduleReadiness<T>(scheduleId);
  },
};
