import { create } from 'zustand';

interface JudgeApprovalState {
  pendingCount: number;
  setPendingCount: (count: number) => void;
  incrementCount: () => void;
  decrementCount: () => void;
}

export const useJudgeApprovalStore = create<JudgeApprovalState>((set) => ({
  pendingCount: 0,
  setPendingCount: (count) => set({ pendingCount: count }),
  incrementCount: () => set((state) => ({ pendingCount: state.pendingCount + 1 })),
  decrementCount: () => set((state) => ({ pendingCount: Math.max(0, state.pendingCount - 1) })),
}));
