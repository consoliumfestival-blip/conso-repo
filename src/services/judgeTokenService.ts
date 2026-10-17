import { judgeTokenRepository } from '../lib/repositories/judgeTokenRepository';
import { databaseProvider } from '../providers/database';
import { Platform } from 'react-native';
import { supabase } from '../core/config/supabase';
export const judgeTokenService = {
  async generateToken(payload: {
    judgeId: string;
    scheduleId: string;
    tenantId: string;
    createdBy: string;
    forceRefresh?: boolean;
  }) {
    const { data, error } = await judgeTokenRepository.generateToken<any>(payload);
    if (error) throw new Error(error.message);
    return data;
  },

  async validateToken(token: string) {
    const { data, error } = await judgeTokenRepository.validateToken<any>(token);
    if (error) throw new Error(error.message);
    if (data && data.judge_id && data.schedule_id && data.tenant_id) {
      try {
        const maskedToken = `****${token.slice(-2)}`;
        let platform = 'Unknown';
        platform = Platform.OS;

        await databaseProvider.logJudgeActivity({
          judgeId: data.judge_id,
          scheduleId: data.schedule_id,
          tenantId: data.tenant_id,
          token,
          actionType: 'CODE_VALIDATED',
          actionDetails: {
            otpMasked: maskedToken,
            platform,
            timestamp: new Date().toISOString()
          }
        });
      } catch (logErr) {
        console.error('Failed to log judge activity', logErr);
      }
    }
    return data;
  },

  async requestLogin(token: string, device_id?: string, device_info?: string) {
    const { data, error } = await supabase.rpc('request_judge_login', {
      p_token: token.toUpperCase().trim(),
      p_device_id: device_id || null,
      p_device_info: device_info || null,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async getLoginStatus(token: string) {
    const { data, error } = await supabase.rpc('get_judge_login_status', {
      p_token: token.toUpperCase().trim(),
    });
    if (error) throw new Error(error.message);
    return data as string;
  },

  async approveLogin(tokenId: string) {
    const { error } = await supabase.rpc('approve_judge_login', {
      p_token_id: tokenId,
    });
    if (error) throw new Error(error.message);
  },

  async rejectLogin(tokenId: string) {
    const { error } = await supabase.rpc('reject_judge_login', {
      p_token_id: tokenId,
    });
    if (error) throw new Error(error.message);
  },

  async expireToken(token: string) {
    const { error } = await judgeTokenRepository.expireToken(token);
    if (error) throw new Error(error.message);
  },

  async listTokens(scheduleId: string) {
    const { data, error } = await judgeTokenRepository.listTokens<any>(scheduleId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};
