import { databaseProvider } from '../providers/database';

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
  public_result_no?: number;
};

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

  async updateResultVisibility(resultId: string, status: ResultStatus): Promise<void> {
    const { error } = await databaseProvider.updateResultVisibility(resultId, status);
    throwIfError(error);
  },

  async bulkUpdateResultVisibility(resultIds: string[], status: ResultStatus): Promise<void> {
    const { error } = await databaseProvider.bulkUpdateResultVisibility(resultIds, status);
    throwIfError(error);
  },
};
