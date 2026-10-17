import { databaseProvider } from '../../providers/database';

export const judgeTokenRepository = {
  async generateToken<T>(payload: {
    judgeId: string;
    scheduleId: string;
    tenantId: string;
    createdBy: string;
    forceRefresh?: boolean;
  }) {
    return databaseProvider.generateJudgeToken<T>(payload);
  },
  async validateToken<T>(token: string) {
    return databaseProvider.validateJudgeToken<T>(token);
  },
  async expireToken(token: string) {
    return databaseProvider.expireJudgeToken(token);
  },
  async listTokens<T>(scheduleId: string) {
    return databaseProvider.listJudgeTokens<T>(scheduleId);
  },
};
