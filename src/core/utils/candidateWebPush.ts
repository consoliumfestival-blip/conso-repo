import { Platform } from 'react-native';

export interface PinnedCandidate {
  slug: string;
  name?: string;
  tenant_id?: string | null;
  festival_id?: string | null;
}

const PINNED_KEY = 'conso_pinned_candidate_v1';
const LOGGED_OUT_KEY = 'conso_candidate_logged_out_v1';
const APP_SESSION_KEY = 'conso_candidate_app_mode_v1';
const INSTALLED_APP_KEY = 'conso_candidate_app_installed_v1';
const PUSH_SUB_KEY = 'conso_candidate_push_sub_v1';

function readLocalPushRecord(): { slug: string; endpoint: string } | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PUSH_SUB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.slug === 'string' && typeof parsed.endpoint === 'string') {
      return parsed;
    }
  } catch {}
  return null;
}

function writeLocalPushRecord(slug: string, endpoint: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PUSH_SUB_KEY, JSON.stringify({ slug, endpoint }));
  } catch {}
}

function clearLocalPushRecord(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PUSH_SUB_KEY);
  } catch {}
}

export function markCandidateAppInstalled(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INSTALLED_APP_KEY, '1');
  } catch {}
}

export async function detectCandidateAppInstalled(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(INSTALLED_APP_KEY) === '1') return true;
    const nav = window.navigator as any;
    if (typeof nav?.getInstalledRelatedApps === 'function') {
      const related = await nav.getInstalledRelatedApps();
      if (Array.isArray(related) && related.length > 0) {
        window.localStorage.setItem(INSTALLED_APP_KEY, '1');
        return true;
      }
    }
  } catch {}
  return false;
}

export function isCandidateStandaloneMode(installedPortalParam?: string | null): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    if (installedPortalParam === 'candidate') {
      window.sessionStorage.setItem(APP_SESSION_KEY, '1');
      return true;
    }
    if (window.sessionStorage.getItem(APP_SESSION_KEY) === '1') {
      return true;
    }
    const standaloneMatch =
      typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = (window.navigator as any)?.standalone === true;
    if (standaloneMatch || iosStandalone) {
      window.sessionStorage.setItem(APP_SESSION_KEY, '1');
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function readPinnedCandidate(): PinnedCandidate | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PINNED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.slug === 'string' && parsed.slug.trim()) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function writePinnedCandidate(candidate: PinnedCandidate): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PINNED_KEY, JSON.stringify(candidate));
    window.localStorage.removeItem(LOGGED_OUT_KEY);
  } catch {}
}

export function clearPinnedCandidate(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PINNED_KEY);
    window.localStorage.setItem(LOGGED_OUT_KEY, '1');
  } catch {}
}

export function isCandidateLoggedOut(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LOGGED_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function updateCandidateManifestMetadata(opts: {
  slug: string;
  name?: string | null;
  tenantId?: string | null;
  festivalId?: string | null;
}): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !opts.slug) return;
  if (opts.name) {
    const titleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (titleMeta) {
      titleMeta.setAttribute('content', opts.name);
    }
  }
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerCandidateServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/candidate/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
}

export interface CandidatePushStatus {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  publicKey: string | null;
}

export async function getCandidatePushStatus(slug: string): Promise<CandidatePushStatus> {
  if (
    Platform.OS !== 'web'
    || typeof window === 'undefined'
    || !('Notification' in window)
    || !('serviceWorker' in navigator)
    || !('PushManager' in window)
  ) {
    return {
      supported: false,
      configured: false,
      permission: 'unsupported',
      subscribed: false,
      publicKey: null,
    };
  }

  let configured = false;
  let publicKey: string | null = null;
  try {
    const keyRes = await fetch('/api/candidate-push?action=vapid-key', { cache: 'no-store' });
    if (keyRes.ok) {
      const data = await keyRes.json();
      configured = Boolean(data?.configured && data?.publicKey);
      publicKey = typeof data?.publicKey === 'string' ? data.publicKey : null;
    }
  } catch {}

  let subscribed = false;
  const localRecord = readLocalPushRecord();
  try {
    const reg = await registerCandidateServiceWorker();
    const existing = await reg?.pushManager.getSubscription();
    if (existing && Notification.permission === 'granted') {
      if (localRecord && localRecord.slug === slug && localRecord.endpoint === existing.endpoint) {
        subscribed = true;
      }
      const statusRes = await fetch(
        `/api/candidate-push?action=status&slug=${encodeURIComponent(slug)}&endpoint=${encodeURIComponent(existing.endpoint)}`,
        { cache: 'no-store' },
      );
      if (statusRes.ok) {
        const statusJson = await statusRes.json();
        if (typeof statusJson?.subscribed === 'boolean') {
          subscribed = statusJson.subscribed;
          if (subscribed) {
            writeLocalPushRecord(slug, existing.endpoint);
          }
        }
      }
    }
  } catch {}

  return {
    supported: true,
    configured,
    permission: Notification.permission,
    subscribed,
    publicKey,
  };
}

export async function enableCandidatePushNotifications(opts: {
  slug: string;
  name?: string | null;
  tenantId: string;
  festivalId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { ok: false, error: 'Web Push is only available in browser.' };
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, error: 'This browser does not support Web Push notifications.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: 'Notification permission was denied.' };
  }

  const keyRes = await fetch('/api/candidate-push?action=vapid-key', { cache: 'no-store' });
  const keyData = keyRes.ok ? await keyRes.json() : null;
  if (!keyData?.configured || !keyData?.publicKey) {
    return {
      ok: false,
      error: 'Push server keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) are not configured on Cloudflare yet.',
    };
  }

  const reg = await registerCandidateServiceWorker();
  if (!reg) {
    return { ok: false, error: 'Could not register candidate service worker (/sw.js).' };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const appKey = urlBase64ToUint8Array(keyData.publicKey);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appKey.buffer.slice(appKey.byteOffset, appKey.byteOffset + appKey.byteLength) as ArrayBuffer,
    });
  }

  const subJson = sub.toJSON();
  const saveRes = await fetch('/api/candidate-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'subscribe',
      slug: opts.slug,
      tenant_id: opts.tenantId,
      festival_id: opts.festivalId || null,
      subscription: {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      },
    }),
  });

  if (!saveRes.ok) {
    const errBody = await saveRes.json().catch(() => null);
    return { ok: false, error: errBody?.error || 'Could not save notification subscription.' };
  }

  if (subJson.endpoint) {
    writeLocalPushRecord(opts.slug, subJson.endpoint);
  }

  // Send an immediate confirmation push notification if configured.
  fetch('/api/candidate-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'send-test',
      slug: opts.slug,
      name: opts.name || 'Candidate',
      subscription: {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      },
    }),
  }).catch(() => {});

  return { ok: true };
}

export async function disableCandidatePushNotifications(): Promise<void> {
  clearLocalPushRecord();
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/candidate/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await fetch('/api/candidate-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unsubscribe', endpoint }),
    }).catch(() => {});
  } catch {}
}
