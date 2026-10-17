import { create } from 'zustand';

interface PageManagementState {
  syncRegistry: () => Promise<void>;
  fetchPages: () => Promise<void>;
}

export const usePageManagementStore = create<PageManagementState>(() => ({
  syncRegistry: async () => {},
  fetchPages: async () => {},
}));
