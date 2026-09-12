/**
 * Stable, restrained pastel colors for SEO keyword highlighting and its
 * legend. The primary keyword always gets its own dedicated color; each
 * secondary keyword gets a color based on its index (cycling if there are
 * more secondary keywords than colors) — never randomized, so a keyword
 * keeps the same color for the whole document session.
 */

export const PRIMARY_HIGHLIGHT_CLASS = "bg-amber-100 text-foreground rounded-[3px] px-0.5 py-px -mx-0.5";
export const PRIMARY_DOT_CLASS = "bg-amber-400";

const SECONDARY_HIGHLIGHT_CLASSES = [
  "bg-sky-100 text-foreground rounded-[3px] px-0.5 py-px -mx-0.5",
  "bg-emerald-100 text-foreground rounded-[3px] px-0.5 py-px -mx-0.5",
  "bg-pink-100 text-foreground rounded-[3px] px-0.5 py-px -mx-0.5",
  "bg-violet-100 text-foreground rounded-[3px] px-0.5 py-px -mx-0.5",
];

const SECONDARY_DOT_CLASSES = ["bg-sky-400", "bg-emerald-400", "bg-pink-400", "bg-violet-400"];

export function secondaryHighlightClass(index: number): string {
  return SECONDARY_HIGHLIGHT_CLASSES[index % SECONDARY_HIGHLIGHT_CLASSES.length];
}

export function secondaryDotClass(index: number): string {
  return SECONDARY_DOT_CLASSES[index % SECONDARY_DOT_CLASSES.length];
}
