import { useSyncExternalStore } from 'react';
import { CoreAppearance, readCoreAppearance } from '@/constants/coreTheme';
export type SidebarAppearance = 'dark' | 'light';
const SIDEBAR_APPEARANCE_KEY = 'admin-sidebar-appearance-v1';
export function readSidebarAppearance(): SidebarAppearance {
  if (typeof localStorage === 'undefined') return 'dark';
  try { return localStorage.getItem(SIDEBAR_APPEARANCE_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}
export function setSidebarAppearance(value: SidebarAppearance) {
  try { localStorage.setItem(SIDEBAR_APPEARANCE_KEY, value); } catch { /* Keep the current session usable when storage is unavailable. */ }
  sidebarAppearance = value;
  sidebarListeners.forEach(listener => listener());
}
let sidebarAppearance = readSidebarAppearance();
const sidebarListeners = new Set<() => void>();
export function useSidebarAppearance() { return useSyncExternalStore((listener) => { sidebarListeners.add(listener); return () => sidebarListeners.delete(listener); }, () => sidebarAppearance, () => 'dark' as SidebarAppearance); }

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
