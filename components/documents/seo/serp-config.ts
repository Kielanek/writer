/**
 * Centralized tokens for the Google-style search-result preview
 * (SerpPreview and friends). Everything visual/behavioral that might need
 * tuning later — if Google's actual result layout shifts — lives here, not
 * scattered across the desktop/mobile components as inline literals.
 *
 * These are a deliberate visual APPROXIMATION, not a pixel-accurate clone —
 * see each component's own doc comment for why (Google truncates based on
 * rendered pixel width and rewrites titles/snippets per-query; there is no
 * way to reproduce that exactly client-side, and this product doesn't try).
 */

export const SERP_PLACEHOLDER_SITE = {
  /** Shown next to the favicon placeholder, and as the mobile breadcrumb's first segment. */
  siteName: "Your Website",
  /** Shown in the breadcrumb URL. Neutral until this product has real per-Project domain settings to read instead. */
  domain: "example.com",
} as const;

export const SERP_DESKTOP = {
  /** Approximates a desktop organic result's title column width. */
  maxWidthPx: 600,
  /** Tailwind `line-clamp-N` utilities — real CSS clamping against maxWidthPx, not a character-count cut. */
  titleClamp: "line-clamp-1",
  descriptionClamp: "line-clamp-2",
} as const;

export const SERP_MOBILE = {
  /** Narrower than desktop on purpose — not desktop scaled down, a different layout. */
  maxWidthPx: 340,
  titleClamp: "line-clamp-2",
  descriptionClamp: "line-clamp-4",
} as const;

/**
 * Soft, product-level editorial guidance only — NOT Google's actual display
 * limits (Google does not publish strict character limits; real truncation
 * is rendered-pixel-width based, which is what the preview above already
 * demonstrates). These just color the character counters and length badge.
 */
export const SERP_TITLE_GUIDANCE = { concise: 60, long: 70 } as const;
export const SERP_DESCRIPTION_GUIDANCE = { concise: 160, long: 170 } as const;

export type SerpLengthState = "good" | "long" | "very-long";

export function classifyLength(length: number, guidance: { concise: number; long: number }): SerpLengthState {
  if (length > guidance.long) return "very-long";
  if (length > guidance.concise) return "long";
  return "good";
}

export const SERP_LENGTH_LABELS: Record<SerpLengthState, string> = {
  good: "Good length",
  long: "Long",
  "very-long": "Very long",
};

export const SERP_LENGTH_COLOR_CLASSES: Record<SerpLengthState, string> = {
  good: "text-muted-foreground",
  long: "text-amber-600",
  "very-long": "text-destructive",
};
