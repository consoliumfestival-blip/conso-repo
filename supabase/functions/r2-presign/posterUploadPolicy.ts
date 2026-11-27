const posterGenerationObjectKey = /^(?:cons-assets\/posters\/[a-z0-9-]+|festivals\/[a-z0-9-]+\/posters)\/[a-f0-9-]{36}\/[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i;

export function isPosterGenerationObjectKey(objectKey: string): boolean {
  return posterGenerationObjectKey.test(objectKey);
}

export function posterGenerationPutConditions(objectKey: string): { IfNoneMatch: '*' } | Record<string, never> {
  return isPosterGenerationObjectKey(objectKey) ? { IfNoneMatch: '*' } : {};
}
