import { useState, useEffect } from 'react';
import { storageService } from '@/services/storage/storageService';

const resolvedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const pendingUrlCache = new Map<string, Promise<string>>();

export async function resolveImageUrl(url?: string | null): Promise<string | undefined> {
  if (!url) return undefined;
  if (!url.startsWith('r2://')) return url;

  const cached = resolvedUrlCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  let pending = pendingUrlCache.get(url);
  if (!pending) {
    const objectKey = url.replace('r2://', '');
    const extension = objectKey.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
    const contentType = extension === 'png' ? 'image/png'
      : extension === 'webp' ? 'image/webp'
        : extension === 'gif' ? 'image/gif'
          : extension === 'svg' ? 'image/svg+xml'
            : 'image/jpeg';
    pending = storageService.getPresignedUrl(objectKey, contentType, 'download');
    pendingUrlCache.set(url, pending);
  }

  try {
    const signedUrl = await pending;
    resolvedUrlCache.set(url, { url: signedUrl, expiresAt: Date.now() + 45 * 60 * 1000 });
    return signedUrl;
  } finally {
    if (pendingUrlCache.get(url) === pending) pendingUrlCache.delete(url);
  }
}

export function useResolvedImageUrl(url?: string | null) {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(() => {
    if (!url) return undefined;
    if (!url.startsWith('r2://')) return url;
    const cached = resolvedUrlCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    return undefined;
  });

  useEffect(() => {
    if (!url) {
      setResolvedUrl(undefined);
      return;
    }
    
    let cancelled = false;
    resolveImageUrl(url)
      .then((signedUrl) => {
        if (!cancelled) setResolvedUrl(signedUrl);
      })
      .catch((error) => {
        console.error('Failed to resolve r2:// url', error);
        if (!cancelled) setResolvedUrl(undefined);
      });
    return () => { cancelled = true; };
  }, [url]);

  return resolvedUrl;
}
