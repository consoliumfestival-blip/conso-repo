import { supabase } from '../../../../core/config/supabase';
import type { PosterDeliveryRecord, PosterDesignSnapshot } from './posterDesignSnapshot';

export interface PosterGenerationResult {
  generationId: string;
  operationId: string;
  assetIds: string[];
  renderHash: string;
  visibilityStatus: 'draft' | 'pending_approval' | 'published' | 'hidden' | 'archived';
  isCurrent: boolean;
}

export interface PosterGenerationSnapshot {
  generationId: string;
  operationId: string;
  snapshot: PosterDesignSnapshot;
}

async function getFunctionErrorMessage(error: { message: string; context?: unknown }): Promise<string> {
  const context = error.context;
  if (context instanceof Response) {
    try {
      const responseBody: unknown = await context.clone().json();
      if (typeof responseBody === 'object' && responseBody !== null && 'error' in responseBody) {
        const message = (responseBody as { error?: unknown }).error;
        if (typeof message === 'string' && message) return message;
      }
    } catch {
      // Use the SDK error message when the edge response is not JSON.
    }
  }
  return error.message;
}

export async function finalizePosterDelivery(
  record: PosterDeliveryRecord,
): Promise<PosterGenerationResult> {
  const { data, error } = await supabase.functions.invoke('poster-generation', {
    body: {
      action: 'finalize',
      operationId: record.operationId,
      userId: record.userId,
      tenantId: record.tenantId,
      festivalId: record.festivalId,
      itemId: record.snapshot.itemId,
      resultId: record.snapshot.resultId,
      templateId: record.snapshot.templateId,
      snapshot: record.snapshot,
      outputs: record.outputs.map(({ blob, ...output }) => ({ ...output, byteSize: blob.size })),
    },
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data || data.found !== true || typeof data.generationId !== 'string' || !Array.isArray(data.assetIds)) {
    throw new Error('Poster generation returned an incomplete result.');
  }
  return data as PosterGenerationResult;
}

export async function lookupPosterGeneration(operationId: string): Promise<PosterGenerationResult | null> {
  const { data, error } = await supabase.functions.invoke('poster-generation', {
    body: { action: 'lookup', operationId },
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (data?.found === false) return null;
  if (!data || data.found !== true || typeof data.generationId !== 'string' || !Array.isArray(data.assetIds)) {
    throw new Error('Poster generation lookup returned an incomplete result.');
  }
  return data as PosterGenerationResult;
}

export async function getPosterGenerationSnapshot(
  generationId: string,
  scope: { tenantId: string; festivalId: string },
): Promise<PosterGenerationSnapshot | null> {
  const { data, error } = await supabase.functions.invoke('poster-generation', {
    body: { action: 'snapshot', generationId, tenantId: scope.tenantId, festivalId: scope.festivalId },
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (data?.found === false) return null;
  if (
    !data
    || data.found !== true
    || typeof data.generationId !== 'string'
    || typeof data.operationId !== 'string'
    || typeof data.snapshot !== 'object'
    || data.snapshot === null
  ) throw new Error('Poster generation snapshot lookup returned an incomplete result.');
  return data as PosterGenerationSnapshot;
}
