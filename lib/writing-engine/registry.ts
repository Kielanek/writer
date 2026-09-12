import type { DocumentType } from "@/types";
import type { BuiltInPreset } from "./types";
import { LINKEDIN_PRESETS } from "./presets/linkedin";
import { ARTICLE_PRESETS } from "./presets/article";
import { YOUTUBE_PRESETS } from "./presets/youtube";
import { NEWSLETTER_PRESETS } from "./presets/newsletter";
import { SUMMARY_PRESETS } from "./presets/summary";

/**
 * The explicit registry of every developer-defined preset. This is the
 * single place built-in presets are discovered — never store them in the
 * database (see lib/db/writingPresets.ts, which is for CUSTOM presets only).
 * Article presets define HOW to write; every Article is SEO-focused, but
 * that's configured per-document (primary/secondary keywords), not per-preset
 * — see lib/writing-engine/seoKeywords.ts.
 */
const BUILT_IN_PRESETS: Record<DocumentType, BuiltInPreset[]> = {
  linkedin_post: LINKEDIN_PRESETS,
  article: ARTICLE_PRESETS,
  youtube_script: YOUTUBE_PRESETS,
  newsletter: NEWSLETTER_PRESETS,
  summary: SUMMARY_PRESETS,
};

export function getBuiltInPresets(documentType: DocumentType): BuiltInPreset[] {
  return BUILT_IN_PRESETS[documentType];
}

export function getBuiltInPreset(id: string): BuiltInPreset | null {
  for (const presets of Object.values(BUILT_IN_PRESETS)) {
    const found = presets.find((p) => p.id === id);
    if (found) return found;
  }
  return null;
}

/** Used as the fallback for old Documents with no preset snapshot, and pre-selected in the UI. */
export function getDefaultBuiltInPreset(documentType: DocumentType): BuiltInPreset {
  const presets = getBuiltInPresets(documentType);
  return presets.find((p) => p.isDefault) ?? presets[0];
}
