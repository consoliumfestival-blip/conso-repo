import { useState, useEffect } from 'react';
import { storageService } from '@/services/storage/storageService';

const resolvedUrlCache = new Map<string, { url: string; expiresAt: number }>();

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
    
    if (url.startsWith('r2://')) {
      const cached = resolvedUrlCache.get(url);
      if (cached && cached.expiresAt > Date.now()) {
        setResolvedUrl(cached.url);
        return;
      }
      const objectKey = url.replace('r2://', '');
      let cancelled = false;
      storageService.getPresignedUrl(objectKey, 'image/jpeg', 'download')
        .then(signedUrl => {
          resolvedUrlCache.set(url, { url: signedUrl, expiresAt: Date.now() + 45 * 60 * 1000 });
          if (!cancelled) setResolvedUrl(signedUrl);
        })
        .catch(err => {
          console.error('Failed to resolve r2:// url', err);
          if (!cancelled) setResolvedUrl(url); // fallback
        });
      return () => { cancelled = true; };
    } else {
      setResolvedUrl(url);
    }
  }, [url]);

  return resolvedUrl;
}
