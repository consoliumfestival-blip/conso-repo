export function parseParticipantNames(input: string): string[] {
  const names = input.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) throw new Error('Enter at least one participant name.');
  const seen = new Set<string>();
  for (const name of names) {
    const normalized = name.toLowerCase();
    if (seen.has(normalized)) throw new Error(`Duplicate participant names are not allowed: ${name}`);
    seen.add(normalized);
  }
  return names;
}
