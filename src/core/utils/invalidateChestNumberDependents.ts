import type { QueryClient } from '@tanstack/react-query';
import { invalidateCodeLetters } from './invalidateCodeLetters';

/** Refresh cached participant and registration labels after archive/restore can renumber chest numbers. */
export function invalidateChestNumberDependents(queryClient: QueryClient): void {
  for (const queryKey of [
    ['participants'],
    ['participant'],
    ['publicCandidateProfile'],
    ['chest-number-order'],
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
  void invalidateCodeLetters(queryClient);
}
