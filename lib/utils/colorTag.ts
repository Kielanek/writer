/**
 * A small, fixed palette of soft (Notion-style) pastel tints, each already
 * paired with a matching foreground color for contrast — the same
 * background/text pairing convention used by DocumentTypeIcon/NoteTypeIcon.
 * Used anywhere an item needs a gentle, consistent-looking color without a
 * dedicated color field in the data model (e.g. Project icon chips).
 */
const PASTEL_TAGS = [
  "bg-rose-50 text-rose-600",
  "bg-orange-50 text-orange-600",
  "bg-amber-50 text-amber-600",
  "bg-lime-50 text-lime-600",
  "bg-emerald-50 text-emerald-600",
  "bg-teal-50 text-teal-600",
  "bg-sky-50 text-sky-600",
  "bg-blue-50 text-blue-600",
  "bg-violet-50 text-violet-600",
  "bg-fuchsia-50 text-fuchsia-600",
] as const;

/** Deterministic: the same seed (e.g. a project id) always maps to the same tag, so a card's color never changes between renders. */
export function pickPastelTag(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PASTEL_TAGS[hash % PASTEL_TAGS.length];
}
