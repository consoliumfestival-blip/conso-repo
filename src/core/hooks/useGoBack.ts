import { useRouter } from 'expo-router';

/**
 * Safe go-back hook.
 * If there is a screen to go back to, it goes back.
 * Otherwise it navigates to the provided fallback route.
 */
export const useGoBack = (fallback: string = '/(admin)') => {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback as any);
    }
  };

  return goBack;
};
