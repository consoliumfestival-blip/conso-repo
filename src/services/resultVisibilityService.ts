import { databaseProvider } from '../providers/database';
import { supabase } from '../core/config/supabase';

export type ResultStatus = 'draft' | 'ready' | 'published' | 'hidden' | 'archived';

export type FestivalResult = {
  result_id: string;
  registration_id: string | null;
  schedule_id: string | null;
  item_id: string | null;
  item_name: string;
  item_name_ml: string;
  is_group: boolean;
  organisation_id: string | null;
  organisation_name: string;
  participant_id: string | null;
  participant_name: string; // blank when not yet published (blind)
  chest_number: string;
  rank: number | null;
  grade: string | null;
  points_awarded: number;
  total_score: number | null;
  published: boolean;
  result_status: ResultStatus;
  public_visible: boolean;
  collection_method: 'judges' | 'manual' | null;
  published_at: string | null;
  festival_id: string | null;
  tenant_id: string | null;
  public_result_no?: number | null;
};

export interface PosterStudioPublicResults {
  rows: FestivalResult[];
  publicOrderByGroupKey: Map<string, number>;
}

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export const resultVisibilityService = {
  async listFestivalResults(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<FestivalResult[]> {
    const { data, error } = await databaseProvider.listAdminPublishedResults<FestivalResult>(
      tenantId,
      festivalId,
    );
    throwIfError(error);
    return data;
  },

  async listPosterStudioResults(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<FestivalResult[]> {
    const { data, error } = await databaseProvider.listPosterStudioPublishedResults<FestivalResult>(
      tenantId,
      festivalId,
    );
    throwIfError(error);
    return data;
  },

  async listPosterStudioPublicResults(
    tenantId: string,
    festivalId: string,
  ): Promise<PosterStudioPublicResults> {
    if (!tenantId || !festivalId) throw new Error('Tenant and festival are required to load public result numbers.');
    const { data, error } = await supabase.rpc('admin_item_results_filtered', {
      p_tenant_id: tenantId,
      p_festival_id: festivalId,
      p_search: '',
      p_category: 'all',
      p_type: 'all',
      p_status: 'all',
    });
    throwIfError(error);
    if (!data || !Array.isArray(data.rows) || !data.items || typeof data.items !== 'object' || Array.isArray(data.items)) {
      throw new Error('Public result order response is invalid. Refresh results and retry.');
    }

    const publicOrderByGroupKey = new Map<string, number>();
    Object.entries(data.items as Record<string, { public_order?: unknown }>).forEach(([key, value]) => {
      const order = value?.public_order;
      if (Number.isSafeInteger(order) && Number(order) > 0) publicOrderByGroupKey.set(key, Number(order));
    });
    return { rows: data.rows as FestivalResult[], publicOrderByGroupKey };
  },

  async updateResultVisibility(resultId: string, status: ResultStatus): Promise<void> {
    const { error } = await databaseProvider.updateResultVisibility(resultId, status);
    throwIfError(error);
  },

  async bulkUpdateResultVisibility(resultIds: string[], status: ResultStatus): Promise<void> {
    const { error } = await databaseProvider.bulkUpdateResultVisibility(resultIds, status);
    throwIfError(error);
  },
};
