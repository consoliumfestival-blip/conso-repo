import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../config/supabase';

// Deduplicate channels when multiple hooks on the same page need the same topic.
const subscriptions = new Map<string, { listeners: Set<() => void>; close: () => void }>();

function listen(topic: string, listener: () => void) {
  let subscription = subscriptions.get(topic);
  if (!subscription) {
    const listeners = new Set<() => void>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      // A swap/draw changes multiple rows in one transaction: fetch only once.
      timer = setTimeout(() => listeners.forEach((notify) => notify()), 150);
    };
    const channel = supabase.channel(topic)
      .on('broadcast', { event: 'changed' }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') refresh(); });
    subscription = { listeners, close: () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    } };
    subscriptions.set(topic, subscription);
  }
  subscription.listeners.add(listener);
  return () => {
    subscription.listeners.delete(listener);
    if (!subscription.listeners.size) {
      subscription.close();
      subscriptions.delete(topic);
    }
  };
}

export function useCodeLetterUpdates(topic: string | null | undefined, onChange: () => void | Promise<unknown>) {
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    if (!topic) return;
    const refresh = () => { void Promise.resolve().then(() => callback.current()).catch(() => {
      // Fetch paths retain their own error state. Never discard drafts on errors.
    }); };
    const stop = listen(`code-letters:${topic}`, refresh);
    const appState = Platform.OS !== 'web'
      ? AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); }) : undefined;
    const visibility = () => { if (document.visibilityState === 'visible') refresh(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
    return () => {
      stop();
      appState?.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
    };
  }, [topic]);
}
