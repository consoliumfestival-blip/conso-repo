import { judgeRepository } from '../lib/repositories/judgeRepository';

import { calculateGrade as getGrade } from '../core/utils/pointCalculator';

// Grade calculation proxy to pointCalculator for backward compatibility
export const calculateGrade = (totalMark: number, maxMark: number): string => {
  return getGrade(totalMark, maxMark) || '-';
};

export const judgeService = {
  async listJudges<T>(tenantId: string) {
    const { data, error } = await judgeRepository.listJudges<T>(tenantId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async createJudge<T>(tenantId: string, festivalId: string, payload: {
    name: string;
    phone?: string;
    specialization?: string[];
  }) {
    const { data, error } = await judgeRepository.createJudge<T>({
      tenant_id: tenantId,
      festival_id: festivalId,
      ...payload,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async updateJudge<T>(id: string, payload: Record<string, unknown>) {
    const { data, error } = await judgeRepository.updateJudge<T>(id, payload);
    if (error) throw new Error(error.message);
    return data;
  },

  async deleteJudge(id: string) {
    const { error } = await judgeRepository.deleteJudge(id);
    if (error) throw new Error(error.message);
  },

  async listJudgeActivityLogs<T>(tenantId: string) {
    const { data, error } = await judgeRepository.listJudgeActivityLogs<T>(tenantId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async assignJudgesToSchedule(scheduleId: string, judgeIds: string[]) {
    const { error } = await judgeRepository.assignJudgesToSchedule(scheduleId, judgeIds);
    if (error) throw new Error(error.message);
  },

  async removeJudgeFromSchedule(scheduleId: string, judgeId: string, force = false) {
    const { error } = await judgeRepository.removeJudgeFromSchedule(
      scheduleId,
      judgeId,
      force
    );
    if (error) throw new Error(error.message);
  },

  async getScheduleJudges<T>(scheduleId: string) {
    const { data, error } = await judgeRepository.getScheduleJudges<T>(scheduleId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async getRegistrationsBySchedule<T>(scheduleId: string) {
    const { data, error } = await judgeRepository.getRegistrationsBySchedule<T>(scheduleId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async getJudgeRegistrationsByToken<T>(token: string) {
    const { data, error } = await judgeRepository.getJudgeRegistrationsByToken<T>(token);
    if (error) throw new Error(error.message);
    return data ?? [];
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
    const { data, error } = await judgeRepository.submitJudgeMark<T>(payload);
    if (error) throw new Error(error.message);
    return data;
  },

  async listMarkEntries<T>(scheduleId: string) {
    const { data, error } = await judgeRepository.listMarkEntries<T>(scheduleId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async saveMarkEntry<T>(payload: {
    schedule_id: string;
    judge_id: string;
    registration_id: string;
    criteria_scores: Record<string, number>;
    total_mark: number;
    entry_mode_snapshot?: 'criteria' | 'total_only';
    max_mark_snapshot?: number;
    criteria_snapshot?: { key: string; label: string; max: number }[];
    tenant_id: string;
    is_draft?: boolean;
  }) {
    const { data, error } = await judgeRepository.upsertMarkEntry<T>(payload);
    if (error) throw new Error(error.message);
    return data;
  },

  async finalizeMarkEntry(markEntryId: string) {
    const { error } = await judgeRepository.finalizeMarkEntry(markEntryId);
    if (error) throw new Error(error.message);
  },

  async unlockJudgeMarks(scheduleId: string, judgeId: string) {
    const { error } = await judgeRepository.unlockJudgeMarks(scheduleId, judgeId);
    if (error) throw new Error(error.message);
  },

  async unlockScheduleMarks(scheduleId: string) {
    const { error } = await judgeRepository.unlockScheduleMarks(scheduleId);
    if (error) throw new Error(error.message);
  },

  async listResults<T>(scheduleId: string) {
    const { data, error } = await judgeRepository.listResults<T>(scheduleId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async publishResults(payloads: Record<string, unknown>[]) {
    const { error } = await judgeRepository.publishResults(payloads);
    if (error) throw new Error(error.message);
  },

  async getJudgeSubmissionSummary<T>(scheduleId: string) {
    const { data, error } = await judgeRepository.getJudgeSubmissionSummary<T>(scheduleId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async getScheduleReadiness<T>(scheduleId: string) {
    const { data, error } = await judgeRepository.getScheduleReadiness<T>(scheduleId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};
