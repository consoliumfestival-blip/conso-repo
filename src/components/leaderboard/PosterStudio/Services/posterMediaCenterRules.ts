import type { PosterDeliveryRecord } from '../Database/posterDesignSnapshot';

export function shouldShowLocalPosterDelivery(
  delivery: PosterDeliveryRecord,
  knownCloudStoragePaths: ReadonlySet<string>,
  currentCloudAssetIds: ReadonlySet<string>,
  cloudMediaAvailable: boolean,
): boolean {
  const hasCloudObject = delivery.outputs.some((output) => knownCloudStoragePaths.has(output.storageKey));
  const hasCloudIdentity = delivery.serverAssetIds.some((assetId) => currentCloudAssetIds.has(assetId));
  if (hasCloudObject || hasCloudIdentity) return false;
  if (delivery.status === 'synced' && cloudMediaAvailable) return false;
  return true;
}
