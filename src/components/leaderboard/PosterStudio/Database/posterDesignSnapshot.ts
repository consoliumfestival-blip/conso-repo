import type { LayerData } from '../Stores/layerStore';
import type { BackgroundTransform, TemplateVariables } from '../Stores/templateStore';
import type { TypographyMode } from '../Utils/eventNameSplitter';
import { LayerSchema } from '../Stores/layerStore';

export interface PosterDeliveryScope {
  userId: string;
  tenantId: string;
  festivalId: string;
}

/** A stable storage identity. Do not put expiring signed URLs in this type. */
export interface PosterAssetReference {
  assetKey: string;
  assetId?: string;
  contentType?: string;
  fontFamily?: string;
}

export interface PosterDesignSnapshot extends PosterDeliveryScope {
  snapshotVersion: 1;
  templateId: string;
  templateVersion: number;
  itemId: string | null;
  resultId: string | null;
  width: number;
  height: number;
  backgroundAsset: PosterAssetReference | null;
  backgroundTransform: BackgroundTransform | null;
  layers: LayerData[];
  variables: TemplateVariables;
  typographyMode: TypographyMode;
  assetReferences: PosterAssetReference[];
  customFontReferences: PosterAssetReference[];
  sourceResultFingerprint: string;
  createdAt: string;
}

export type PosterDeliveryStatus =
  | 'pending_upload'
  | 'uploading'
  | 'pending_finalize'
  | 'failed'
  | 'synced';

export type PosterDeliveryStage = 'upload' | 'verify' | 'finalize';

export interface PosterDeliveryOutput {
  outputId: string;
  resolutions: string[];
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
  /** Persisted before transfer and reused for every retry. */
  storageKey: string;
}

export interface PosterSourceAssetBlob extends PosterAssetReference {
  blob: Blob;
}

export interface PosterVerifiedOutput {
  outputId: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  resolutions: string[];
  etag: string;
  verifiedAt: string;
}

export interface PosterDeliveryRecord extends PosterDeliveryScope {
  operationId: string;
  snapshot: PosterDesignSnapshot;
  outputs: PosterDeliveryOutput[];
  sourceAssets: PosterSourceAssetBlob[];
  missingSourceAssetKeys: string[];
  status: PosterDeliveryStatus;
  stage: PosterDeliveryStage;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  leaseOwnerId: string | null;
  leaseExpiresAt: number | null;
  verifiedOutputs: PosterVerifiedOutput[];
  serverGenerationId: string | null;
  serverAssetIds: string[];
  serverVisibilityStatus?: 'draft' | 'pending_approval' | 'published' | 'hidden' | 'archived' | null;
  lastError: string | null;
}

export function isPosterDesignSnapshot(value: unknown): value is PosterDesignSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const snapshot = value as Partial<PosterDesignSnapshot>;
  const validScope = typeof snapshot.userId === 'string' && snapshot.userId.length > 0
    && typeof snapshot.tenantId === 'string' && snapshot.tenantId.length > 0
    && typeof snapshot.festivalId === 'string' && snapshot.festivalId.length > 0;
  const validAssetReference = (reference: unknown) => typeof reference === 'object'
    && reference !== null
    && typeof (reference as PosterAssetReference).assetKey === 'string'
    && (reference as PosterAssetReference).assetKey.length > 0;
  const validBackgroundTransform = snapshot.backgroundTransform === null
    || (typeof snapshot.backgroundTransform === 'object'
      && snapshot.backgroundTransform !== null
      && Number.isFinite(snapshot.backgroundTransform.scale)
      && Number.isFinite(snapshot.backgroundTransform.x)
      && Number.isFinite(snapshot.backgroundTransform.y));
  return snapshot.snapshotVersion === 1
    && validScope
    && typeof snapshot.templateId === 'string' && snapshot.templateId.length > 0
    && Number.isFinite(snapshot.templateVersion)
    && (typeof snapshot.itemId === 'string' || snapshot.itemId === null)
    && (typeof snapshot.resultId === 'string' || snapshot.resultId === null)
    && (Boolean(snapshot.itemId) || Boolean(snapshot.resultId))
    && Number.isFinite(snapshot.width) && Number(snapshot.width) > 0
    && Number.isFinite(snapshot.height) && Number(snapshot.height) > 0
    && (snapshot.backgroundAsset === null || validAssetReference(snapshot.backgroundAsset))
    && validBackgroundTransform
    && Array.isArray(snapshot.layers)
    && snapshot.layers.every((layer) => LayerSchema.safeParse(layer).success)
    && typeof snapshot.variables === 'object' && snapshot.variables !== null && !Array.isArray(snapshot.variables)
    && (snapshot.typographyMode === 'A' || snapshot.typographyMode === 'B')
    && Array.isArray(snapshot.assetReferences) && snapshot.assetReferences.every(validAssetReference)
    && Array.isArray(snapshot.customFontReferences) && snapshot.customFontReferences.every(validAssetReference)
    && typeof snapshot.sourceResultFingerprint === 'string'
    && typeof snapshot.createdAt === 'string';
}
