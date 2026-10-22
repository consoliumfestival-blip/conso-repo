type CheckInEntry = {
  entry_kind?: string;
  participant_id?: string | null;
  participants?: { id?: string | null; chest_number?: string | null };
};

// A student card can identify a student entry only. In particular, an absent
// QR participant ID must never match a General entry's intentionally null ID.
export function findParticipantQrEntry<T extends CheckInEntry>(entries: T[], qr: { chest?: string; pid?: string }): T | undefined {
  return entries.find(entry => entry.entry_kind !== 'general_team'
    && !!(entry.participant_id || entry.participants?.id)
    && ((!!qr.chest && entry.participants?.chest_number === qr.chest)
      || (!!qr.pid && entry.participants?.id === qr.pid)));
}
