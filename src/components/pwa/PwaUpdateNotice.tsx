import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Check, RefreshCw } from 'lucide-react-native';
import { ui } from '@/constants/designSystem';

type UpdateState = 'hidden' | 'available' | 'updating' | 'updated';
const UPDATED_SESSION_KEY = 'consolium_pwa_update_requested';
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function currentAppAssets(doc: Document): string[] {
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('script[src]'))
    .map((script) => script.getAttribute('src') || '');
  const stylesheets = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'))
    .map((link) => link.getAttribute('href') || '');
  return [...scripts, ...stylesheets]
    .map((asset) => new URL(asset, window.location.origin).pathname)
    .filter((asset) => /\/_expo\/static\/js\/web\/entry-[^/]+\.js$/.test(asset)
      || /\/_expo\/static\/css\/web-[^/]+\.css$/.test(asset))
    .sort();
}

function isInstalledWebApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Offers a manual reload only when an installed web app is serving an older Expo bundle. */
export function PwaUpdateNotice({ accentColor = ui.colors.primary, bottomOffset = 16 }: { accentColor?: string; bottomOffset?: number }) {
  const [state, setState] = useState<UpdateState>('hidden');
  const pulse = useRef(new Animated.Value(1)).current;

  const checkForUpdate = useCallback(async () => {
    if (Platform.OS !== 'web' || !isInstalledWebApp() || document.visibilityState === 'hidden') return;
    try {
      const response = await fetch(`${window.location.origin}/`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) return;
      const html = await response.text();
      const remoteDocument = new DOMParser().parseFromString(html, 'text/html');
      const currentAssets = currentAppAssets(document);
      const remoteAssets = currentAppAssets(remoteDocument);
      if (!currentAssets.length || !remoteAssets.length) return;
      const hasUpdate = currentAssets.join('|') !== remoteAssets.join('|');
      if (!hasUpdate && sessionStorage.getItem(UPDATED_SESSION_KEY) === '1') {
        sessionStorage.removeItem(UPDATED_SESSION_KEY);
        setState('updated');
        window.setTimeout(() => setState('hidden'), 2600);
      } else if (hasUpdate) {
        setState('available');
      }
    } catch {
      // A failed availability check must not interrupt the current session.
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    void checkForUpdate();
    const interval = window.setInterval(() => { void checkForUpdate(); }, UPDATE_CHECK_INTERVAL_MS);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void checkForUpdate(); };
    window.addEventListener('focus', onVisibilityChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onVisibilityChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkForUpdate]);

  useEffect(() => {
    if (state !== 'available') {
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.35, duration: 850, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [state, pulse]);

  if (Platform.OS !== 'web' || state === 'hidden') return null;

  const applyUpdate = () => {
    if (state !== 'available' || !navigator.onLine) return;
    sessionStorage.setItem(UPDATED_SESSION_KEY, '1');
    setState('updating');
    window.setTimeout(() => window.location.reload(), 100);
  };

  const complete = state === 'updated';
  const busy = state === 'updating';
  const label = complete ? 'Updated' : busy ? 'Updating…' : 'Update available';

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', bottom: `max(${bottomOffset}px, env(safe-area-inset-bottom, 0px))` as any, right: 12, zIndex: 2000 }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={complete ? 'The installed app has reloaded.' : 'Reloads the app to use the latest deployed version.'}
        disabled={busy || complete || !navigator.onLine}
        onPress={applyUpdate}
        style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: complete ? '#A7F3D0' : '#99D8CC', backgroundColor: complete ? '#ECFDF5' : '#FFFFFF', shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}
      >
        {busy ? <ActivityIndicator size="small" color={accentColor} /> : complete ? <Check size={16} color="#047857" /> : (
          <Animated.View style={{ opacity: pulse }}>
            <RefreshCw size={15} color={accentColor} />
          </Animated.View>
        )}
        <Text style={{ color: complete ? '#047857' : '#115E59', fontSize: 12, fontWeight: '700' }}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}
