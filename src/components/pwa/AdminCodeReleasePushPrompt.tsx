import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/core/config/supabase';
import { useAuthStore } from '@/core/store/authStore';
import { ui } from '@/constants/designSystem';

const SESSION_KEY = 'consolium_admin_release_push_prompted';
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_ADMIN_WEB_PUSH_VAPID_PUBLIC_KEY || '';

type PromptMode = 'enable' | 'ios-install' | 'blocked';

function isIosBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInstalledPwa() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function decodeVapidKey(key: string) {
  const padded = key + '='.repeat((4 - key.length % 4) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function waitUntilActive(registration: ServiceWorkerRegistration) {
  if (registration.active) return registration;
  const worker = registration.installing || registration.waiting;
  if (!worker) throw new Error('The notification worker did not start. Reload and try again.');
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('The notification worker is taking too long. Try again.')), 10000);
    const check = () => {
      if (worker.state === 'activated') {
        window.clearTimeout(timeout);
        resolve();
      } else if (worker.state === 'redundant') {
        window.clearTimeout(timeout);
        reject(new Error('The notification worker could not be installed. Reload and try again.'));
      }
    };
    worker.addEventListener('statechange', check);
    check();
  });
  return registration;
}

export function AdminCodeReleasePushPrompt() {
  const { user, role, tenant_id, is_superadmin } = useAuthStore();
  const [mode, setMode] = useState<PromptMode>('enable');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowed = !!user?.id && (!!is_superadmin || role === 'admin') && (!!tenant_id || !!is_superadmin);

  useEffect(() => {
    if (Platform.OS !== 'web' || !allowed || !user?.id) return;
    const promptedKey = `${SESSION_KEY}:${user.id}`;
    if (sessionStorage.getItem(promptedKey) === '1') return;

    let cancelled = false;
    const prepare = async () => {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
        return;
      }
      if (Notification.permission === 'granted') {
        try {
          const registration = await navigator.serviceWorker.getRegistration('/admin-push/');
          const subscription = await registration?.pushManager.getSubscription();
          if (subscription) {
            const { data } = await supabase.from('admin_web_push_subscriptions').select('id')
              .eq('user_id', user.id).eq('endpoint', subscription.endpoint).maybeSingle();
            if (data) return;
          }
        } catch { /* Show the opt-in again if checking the saved subscription failed. */ }
      }
      timer.current = setTimeout(() => {
        if (cancelled) return;
        if (isIosBrowser() && !isInstalledPwa()) setMode('ios-install');
        else if (Notification.permission === 'denied') setMode('blocked');
        else setMode('enable');
        setVisible(true);
      }, 8000);
    };
    void prepare();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [allowed, user?.id]);

  const close = () => {
    if (user?.id) sessionStorage.setItem(`${SESSION_KEY}:${user.id}`, '1');
    setVisible(false);
  };

  const enable = async () => {
    if (!allowed || !user?.id || !VAPID_PUBLIC_KEY) return;
    setBusy(true);
    setError('');
    try {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') {
        setMode('blocked');
        setError('');
        return;
      }
      const registration = await navigator.serviceWorker.register('/admin-push/sw.js', { scope: '/admin-push/' });
      const activeRegistration = await waitUntilActive(registration);
      const subscription = await activeRegistration.pushManager.getSubscription()
        || await activeRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(VAPID_PUBLIC_KEY),
        });
      const result = await supabase.from('admin_web_push_subscriptions').upsert({
        user_id: user.id,
        tenant_id: tenant_id || null,
        endpoint: subscription.endpoint,
        subscription: subscription.toJSON(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (result.error) throw result.error;
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not enable release notifications. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (Platform.OS !== 'web' || !visible) return null;

  const title = mode === 'ios-install' ? 'Install Consolium first' : mode === 'blocked' ? 'Allow notifications in browser settings' : 'Get app update alerts';
  const description = mode === 'ios-install'
    ? 'On iPhone or iPad, add this portal to your Home Screen and open the installed app before enabling release notifications.'
    : mode === 'blocked'
      ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then return here.'
      : 'Receive a notification in this Admin portal when a new production version is deployed. Data changes will not send these alerts.';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.secondary}>
              <Text style={styles.secondaryText}>Later</Text>
            </Pressable>
            {mode === 'enable' && (
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void enable()} style={[styles.primary, busy && styles.disabled]}>
                <Text style={styles.primaryText}>{busy ? 'Enabling…' : 'Enable notifications'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(15, 23, 42, 0.42)' },
  card: { width: '100%', maxWidth: 420, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface },
  title: { color: ui.colors.text, fontSize: 18, fontWeight: '700' },
  description: { color: ui.colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 9 },
  error: { color: '#B42318', fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  secondary: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: ui.colors.border },
  secondaryText: { color: ui.colors.text, fontSize: 13, fontWeight: '600' },
  primary: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: ui.colors.primary },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
