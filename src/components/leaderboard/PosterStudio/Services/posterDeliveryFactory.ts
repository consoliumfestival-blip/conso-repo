import type { LayerData } from '../Stores/layerStore';
import type { BackgroundTransform, TemplateData, TemplateVariables } from '../Stores/templateStore';
import type { TypographyMode } from '../Utils/eventNameSplitter';
import type {
  PosterAssetReference,
  PosterDeliveryRecord,
  PosterDeliveryScope,
  PosterDesignSnapshot,
} from '../Database/posterDesignSnapshot';
import { createPosterObjectKey } from './posterDeliveryService';

export interface PosterDesignInput {
  scope: PosterDeliveryScope;
  template: Pick<TemplateData, 'id' | 'template_version' | 'width' | 'height' | 'background_url' | 'background_transform'>;
  itemId: string | null;
  resultId: string | null;
  layers: LayerData[];
  variables: TemplateVariables;
  typographyMode: TypographyMode;
  sourceResultFingerprint: string;
  customFontReferences?: PosterAssetReference[];
  createdAt?: string;
}

export function stablePosterAssetReference(source: string | null | undefined): PosterAssetReference | null {
  const value = source?.trim();
  if (!value) return null;
  if (value.startsWith('r2://')) {
    const assetKey = value.slice('r2://'.length).replace(/^\/+/, '');
    return assetKey ? { assetKey } : null;
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return { assetKey: `${url.origin}${url.pathname}` };
    } catch {
      return null;
    }
  }
  if (value.startsWith('/') && !value.startsWith('//')) return { assetKey: value.split(/[?#]/, 1)[0] };
  return null;
}

export function createPosterDesignSnapshot(input: PosterDesignInput): PosterDesignSnapshot {
  const templateId = input.template.id?.trim();
  if (!templateId || !input.scope.userId.trim() || !input.scope.tenantId.trim() || !input.scope.festivalId.trim()) {
    throw new TypeError('Poster snapshot requires a saved template and complete account, tenant, and festival scope.');
  }
  if (!input.itemId && !input.resultId) {
    throw new TypeError('Poster snapshot requires an official item or result.');
  }
  if (input.template.width <= 0 || input.template.height <= 0) {
    throw new TypeError('Poster template dimensions are invalid.');
  }

  const layers = JSON.parse(JSON.stringify(input.layers)) as LayerData[];
  for (const layer of layers) {
    if (layer.type !== 'image' || !layer.src) continue;
    const reference = stablePosterAssetReference(layer.src);
    if (!reference) continue;
    // Persist stable keys rather than expiring signed URLs embedded in saved designs.
    layer.src = reference.assetKey.startsWith('http') || reference.assetKey.startsWith('/')
      ? reference.assetKey
      : `r2://${reference.assetKey}`;
  }
  const variables = JSON.parse(JSON.stringify(input.variables)) as TemplateVariables;
  const backgroundAsset = stablePosterAssetReference(input.template.background_url);
  const assetReferences = [
    backgroundAsset,
    ...layers
      .filter((layer) => layer.type === 'image')
      .map((layer) => stablePosterAssetReference(layer.src)),
  ].filter((reference): reference is PosterAssetReference => reference !== null);
  const fontFamilies = new Set(
    layers
      .filter((layer) => layer.type === 'text' && layer.fontFamily)
      .map((layer) => layer.fontFamily as string),
  );
  const customFontReferences = (input.customFontReferences ?? [])
    .filter((reference) => Boolean(reference.fontFamily && fontFamilies.has(reference.fontFamily)));
  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    snapshotVersion: 1,
    ...input.scope,
    templateId,
    templateVersion: input.template.template_version,
    itemId: input.itemId,
    resultId: input.resultId,
    width: input.template.width,
    height: input.template.height,
    backgroundAsset,
    backgroundTransform: input.template.background_transform
      ? JSON.parse(JSON.stringify(input.template.background_transform)) as BackgroundTransform
      : null,
    layers,
    variables,
    typographyMode: input.typographyMode,
    assetReferences: [...new Map(assetReferences.map((ref) => [ref.assetKey, ref])).values()],
    customFontReferences,
    sourceResultFingerprint: input.sourceResultFingerprint || JSON.stringify({
      itemId: input.itemId,
      resultId: input.resultId,
      variables,
    }),
    createdAt,
  };
}

export function createPendingPosterDelivery(input: {
  operationId: string;
  scope: PosterDeliveryScope;
  snapshot: PosterDesignSnapshot;
  blob: Blob;
  width: number;
  height: number;
  createdAt?: string;
}): PosterDeliveryRecord {
  if (!input.blob.size || !['image/jpeg', 'image/png', 'image/webp'].includes(input.blob.type)) {
    throw new TypeError('Poster output must be a non-empty JPG, PNG, or WEBP image.');
  }
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width <= 0 || input.height <= 0) {
    throw new TypeError('Poster output dimensions are invalid.');
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  const outputId = 'poster';

  return {
    operationId: input.operationId,
    ...input.scope,
    snapshot: input.snapshot,
    outputs: [{
      outputId,
      resolutions: ['hd', 'standard'],
      blob: input.blob,
      contentType: input.blob.type,
      width: input.width,
      height: input.height,
      storageKey: createPosterObjectKey(
        input.scope.festivalId,
        input.operationId,
        outputId,
        input.blob.type,
      ),
    }],
    sourceAssets: [],
    // Stable references are not missing until a restore attempt fails to reconnect them.
    missingSourceAssetKeys: [],
    status: 'pending_upload',
    stage: 'upload',
    attemptCount: 0,
    createdAt,
    updatedAt: createdAt,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    verifiedOutputs: [],
    serverGenerationId: null,
    serverAssetIds: [],
    serverVisibilityStatus: null,
    lastError: null,
  };
}

export async function measurePosterBlob(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('This browser cannot read the captured poster dimensions.');
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Captured poster image could not be decoded.'));
      image.src = objectUrl;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
