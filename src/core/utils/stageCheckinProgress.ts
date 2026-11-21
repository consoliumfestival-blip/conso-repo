// Display progress only; cancellation and draw permissions stay server-owned.
export function getStageCheckinProgress(activeCount: number, verifiedCount: number, codedCount: number, isShuffleLocked = false) {
  const codesDone = isShuffleLocked || (verifiedCount > 0 && codedCount === verifiedCount);
  const checkinDone = isShuffleLocked || codesDone || (activeCount > 0 && verifiedCount === activeCount);
  return {
    checkinDone,
    checkinPending: !checkinDone && activeCount > verifiedCount,
    codesDone,
    codesPending: !codesDone && verifiedCount > codedCount,
    attendanceLabel: `${verifiedCount}/${activeCount} present`,
  };
}
