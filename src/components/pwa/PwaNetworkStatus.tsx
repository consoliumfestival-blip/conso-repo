import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Wifi, WifiOff } from 'lucide-react-native';
import { ui } from '@/constants/designSystem';

type NetworkStatus = 'online' | 'offline' | 'restored' | 'retrying' | 'retry-failed';

function getInitialStatus(): NetworkStatus {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine
    ? 'offline'
    : 'online';
}

/** Shows browser connectivity and lets users retry active page queries without replaying writes. */
export function PwaNetworkStatus() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<NetworkStatus>(getInitialStatus);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleOffline = () => setStatus('offline');
    const handleOnline = () => {
      setStatus((current) => current === 'offline' || current === 'retry-failed' ? 'restored' : current);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const retryPageData = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }

    setStatus('retrying');
    try {
      await queryClient.refetchQueries(
        { type: 'active' },
        { cancelRefetch: false, throwOnError: true },
      );
      setStatus('online');
    } catch {
      setStatus(navigator.onLine ? 'retry-failed' : 'offline');
    }
  }, [queryClient]);

  if (Platform.OS !== 'web' || status === 'online') return null;

  const offline = status === 'offline';
  const retrying = status === 'retrying';
  const label = offline
    ? 'Offline'
    : retrying
      ? 'Retrying page data…'
      : status === 'retry-failed'
        ? 'Some data could not refresh'
        : 'Connection restored';

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'fixed' as any, top: 'max(8px, env(safe-area-inset-top, 0px))' as any, left: 8, right: 8, zIndex: 3000, alignItems: 'center' }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{ width: '100%', maxWidth: 460, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 11, borderWidth: 1, borderColor: offline || status === 'retry-failed' ? ui.colors.warning : ui.colors.border, backgroundColor: offline || status === 'retry-failed' ? ui.colors.warningSoft : ui.colors.surface, boxShadow: '0 3px 12px rgba(15, 23, 42, 0.12)' as any }}
      >
        {retrying ? <ActivityIndicator size="small" color={ui.colors.primary} /> : offline || status === 'retry-failed' ? <WifiOff size={16} color={ui.colors.warning} /> : <Wifi size={16} color={ui.colors.primary} />}
        <Text numberOfLines={1} style={{ flex: 1, color: ui.colors.text, fontSize: 12, fontWeight: '600' }}>
          {label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading page data"
          disabled={retrying}
          onPress={() => { void retryPageData(); }}
          style={{ minHeight: 32, minWidth: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, borderRadius: 8, backgroundColor: ui.colors.surface, opacity: retrying ? 0.6 : 1 }}
        >
          <Text style={{ color: ui.colors.primary, fontSize: 12, fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
}
