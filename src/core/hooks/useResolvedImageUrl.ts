import { useState, useEffect } from 'react';
import { storageService } from '@/services/storage/storageService';

export function useResolvedImageUrl(url?: string | null) {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!url) {
      setResolvedUrl(undefined);
      return;
    }
    
    if (url.startsWith('r2://')) {
      const objectKey = url.replace('r2://', '');
      storageService.getPresignedUrl(objectKey, 'image/jpeg', 'download')
        .then(signedUrl => {
          setResolvedUrl(signedUrl);
        })
        .catch(err => {
          console.error('Failed to resolve r2:// url', err);
          setResolvedUrl(url); // fallback
        });
    } else {
      setResolvedUrl(url);
    }
  }, [url]);

  return resolvedUrl;
}
