import { useSyncExternalStore } from 'react';
import { CoreAppearance, readCoreAppearance } from '@/constants/coreTheme';

let appearance = readCoreAppearance();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => appearance;
export function setCoreAppearance(next: CoreAppearance) {
  if (appearance.mode === next.mode && appearance.palette === next.palette) return;
  appearance = next;
  listeners.forEach(listener => listener());
}
export function useCoreAppearancePreference() { return useSyncExternalStore(subscribe, snapshot, snapshot); }
