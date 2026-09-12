import { z } from "zod";
import type { DocumentType } from "@/types";

/**
 * Centralized typed schema for the guided Preset Creator's questionnaire
 * answers. This is the ONE source of truth for what a "preset configuration"
 * looks like — the wizard UI, the compiler (compilePresetSettings.ts), and
 * validation (Zod, below) all read from these same types/enums.
 *
 * Stored in writing_presets.settings (nullable — built-in presets and
 * presets created before this feature existed have none) and frozen into
 * documents.preset_snapshot.settings at generation time.
 */

// --- Common (Steps 1-3 shared fields) --------------------------------------

export const VOICE_TRAITS = [
  "direct",
  "conversational",
  "expert",
  "personal",
  "educational",
  "opinionated",
  "casual",
  "formal",
  "provocative",
  "story_driven",
  "concise",
] as const;
export type VoiceTrait = (typeof VOICE_TRAITS)[number];

export const FORMALITY_OPTIONS = ["casual", "balanced", "professional"] as const;
export type Formality = (typeof FORMALITY_OPTIONS)[number];

export const ASSERTIVENESS_OPTIONS = ["soft", "balanced", "strong"] as const;
export type Assertiveness = (typeof ASSERTIVENESS_OPTIONS)[number];

export const FIRST_PERSON_OPTIONS = ["rarely", "when_natural", "frequently"] as const;
export type FirstPerson = (typeof FIRST_PERSON_OPTIONS)[number];

export const PARAGRAPH_STYLE_OPTIONS = ["short_punchy", "natural_variation", "longer_editorial"] as const;
export type ParagraphStyle = (typeof PARAGRAPH_STYLE_OPTIONS)[number];

export const SENTENCE_RHYTHM_OPTIONS = ["mostly_short", "mixed", "more_detailed"] as const;
export type SentenceRhythm = (typeof SENTENCE_RHYTHM_OPTIONS)[number];

export const LIST_USAGE_OPTIONS = ["avoid", "when_useful", "often"] as const;
export type ListUsage = (typeof LIST_USAGE_OPTIONS)[number];

// --- Length ------------------------------------------------------------

/**
 * One shape covers every type: "short"/"medium"/"long" are quick presets,
 * "custom" carries an explicit min/max in the type-appropriate unit.
 * Summary reuses short/medium/long as brief/balanced/detailed (same
 * underlying concept, just labeled differently in the UI). YouTube always
 * behaves like "custom" with unit "minutes" (there's no natural short/
 * medium/long for a duration) — the UI simply doesn't offer those buttons
 * for that type.
 */
export const LENGTH_MODES = ["short", "medium", "long", "custom"] as const;
export type LengthMode = (typeof LENGTH_MODES)[number];

export const LENGTH_UNITS = ["characters", "words", "minutes"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

export interface LengthSettings {
  mode: LengthMode;
  unit: LengthUnit;
  min?: number;
  max?: number;
}

export const lengthSettingsSchema = z
  .object({
    mode: z.enum(LENGTH_MODES),
    unit: z.enum(LENGTH_UNITS),
    min: z.number().int().positive().max(1_000_000).optional(),
    max: z.number().int().positive().max(1_000_000).optional(),
  })
  .refine((v) => v.min == null || v.max == null || v.min <= v.max, {
    message: "Minimum length cannot exceed maximum length.",
    path: ["min"],
  });

// --- Type-specific settings ----------------------------------------------

export const LINKEDIN_OPENING_STYLES = [
  "strong_observation",
  "clear_opinion",
  "story_situation",
  "problem",
  "contrarian",
  "question",
  "let_ai_choose",
] as const;
export const LINKEDIN_ENDING_STYLES = [
  "strong_conclusion",
  "practical_takeaway",
  "open_thought",
  "question",
  "cta",
  "let_it_end_naturally",
] as const;
export const EMOJI_OPTIONS = ["never", "sparingly", "allowed"] as const;
export const HASHTAG_OPTIONS = ["never", "only_if_requested", "allowed"] as const;

export const linkedinTypeSettingsSchema = z.object({
  documentType: z.literal("linkedin_post"),
  openingStyles: z.array(z.enum(LINKEDIN_OPENING_STYLES)).max(3).default([]),
  endingStyles: z.array(z.enum(LINKEDIN_ENDING_STYLES)).max(3).default([]),
  avoidForcedEndings: z.boolean().default(true),
  emojis: z.enum(EMOJI_OPTIONS).default("never"),
  hashtags: z.enum(HASHTAG_OPTIONS).default("never"),
});
export type LinkedInTypeSettings = z.infer<typeof linkedinTypeSettingsSchema>;

export const ARTICLE_INTRO_STYLES = [
  "answer_quickly",
  "start_with_problem",
  "start_with_example",
  "build_context_first",
  "let_ai_choose",
] as const;
export const ARTICLE_HEADINGS_OPTIONS = ["minimal", "natural", "highly_structured"] as const;
export const ARTICLE_DEPTH_OPTIONS = ["concise", "balanced", "deep"] as const;
export const ARTICLE_CONCLUSION_STYLES = [
  "clear_conclusion",
  "practical_next_steps",
  "broader_implication",
  "no_forced_conclusion",
] as const;

export const articleTypeSettingsSchema = z.object({
  documentType: z.literal("article"),
  introStyle: z.enum(ARTICLE_INTRO_STYLES).default("let_ai_choose"),
  headings: z.enum(ARTICLE_HEADINGS_OPTIONS).default("natural"),
  depth: z.enum(ARTICLE_DEPTH_OPTIONS).default("balanced"),
  conclusionStyle: z.enum(ARTICLE_CONCLUSION_STYLES).default("clear_conclusion"),
});
export type ArticleTypeSettings = z.infer<typeof articleTypeSettingsSchema>;

export const YOUTUBE_HOOK_STYLES = [
  "direct_promise",
  "problem",
  "curiosity",
  "story_moment",
  "strong_opinion",
  "let_ai_choose",
] as const;
export const YOUTUBE_PACING_OPTIONS = ["fast", "balanced", "detailed"] as const;
export const YOUTUBE_STRUCTURE_OPTIONS = ["educational", "story_driven", "list_style", "tutorial", "flexible"] as const;
export const YOUTUBE_CTA_STYLES = ["none", "light", "standard", "let_ai_choose"] as const;
export const YOUTUBE_PRODUCTION_NOTES_OPTIONS = ["no", "only_when_useful", "yes"] as const;

export const youtubeTypeSettingsSchema = z.object({
  documentType: z.literal("youtube_script"),
  hookStyle: z.enum(YOUTUBE_HOOK_STYLES).default("let_ai_choose"),
  pacing: z.enum(YOUTUBE_PACING_OPTIONS).default("balanced"),
  structure: z.enum(YOUTUBE_STRUCTURE_OPTIONS).default("flexible"),
  ctaStyle: z.enum(YOUTUBE_CTA_STYLES).default("let_ai_choose"),
  productionNotes: z.enum(YOUTUBE_PRODUCTION_NOTES_OPTIONS).default("only_when_useful"),
});
export type YoutubeTypeSettings = z.infer<typeof youtubeTypeSettingsSchema>;

export const NEWSLETTER_STYLE_OPTIONS = ["personal", "educational", "story_lesson", "opinion", "flexible"] as const;
export const NEWSLETTER_OPENING_STYLES = ["direct_idea", "personal_note", "story", "problem", "let_ai_choose"] as const;
export const NEWSLETTER_ENDING_STYLES = [
  "natural_close",
  "practical_takeaway",
  "question",
  "cta",
  "no_forced_ending",
] as const;
export const NEWSLETTER_GREETING_OPTIONS = ["none", "casual", "standard"] as const;

export const newsletterTypeSettingsSchema = z.object({
  documentType: z.literal("newsletter"),
  style: z.enum(NEWSLETTER_STYLE_OPTIONS).default("flexible"),
  opening: z.enum(NEWSLETTER_OPENING_STYLES).default("let_ai_choose"),
  ending: z.enum(NEWSLETTER_ENDING_STYLES).default("natural_close"),
  greeting: z.enum(NEWSLETTER_GREETING_OPTIONS).default("none"),
});
export type NewsletterTypeSettings = z.infer<typeof newsletterTypeSettingsSchema>;

export const SUMMARY_FORMAT_OPTIONS = ["mostly_prose", "mixed", "mostly_bullets"] as const;
export const SUMMARY_FOCUS_OPTIONS = [
  "main_conclusions",
  "key_ideas",
  "action_items",
  "examples",
  "open_questions",
  "contradictions",
] as const;

export const summaryTypeSettingsSchema = z.object({
  documentType: z.literal("summary"),
  format: z.enum(SUMMARY_FORMAT_OPTIONS).default("mixed"),
  focus: z.array(z.enum(SUMMARY_FOCUS_OPTIONS)).max(SUMMARY_FOCUS_OPTIONS.length).default([]),
});
export type SummaryTypeSettings = z.infer<typeof summaryTypeSettingsSchema>;

export const typeSpecificSettingsSchema = z.discriminatedUnion("documentType", [
  linkedinTypeSettingsSchema,
  articleTypeSettingsSchema,
  youtubeTypeSettingsSchema,
  newsletterTypeSettingsSchema,
  summaryTypeSettingsSchema,
]);
export type TypeSpecificSettings =
  | LinkedInTypeSettings
  | ArticleTypeSettings
  | YoutubeTypeSettings
  | NewsletterTypeSettings
  | SummaryTypeSettings;

// --- Full settings object -------------------------------------------------

export const presetSettingsSchema = z.object({
  purpose: z.string().trim().max(500).optional(),
  audience: z.string().trim().max(300).optional(),
  voice: z.array(z.enum(VOICE_TRAITS)).max(3).default([]),
  formality: z.enum(FORMALITY_OPTIONS).default("balanced"),
  assertiveness: z.enum(ASSERTIVENESS_OPTIONS).default("balanced"),
  firstPerson: z.enum(FIRST_PERSON_OPTIONS).default("when_natural"),
  paragraphStyle: z.enum(PARAGRAPH_STYLE_OPTIONS).default("natural_variation"),
  sentenceRhythm: z.enum(SENTENCE_RHYTHM_OPTIONS).default("mixed"),
  listUsage: z.enum(LIST_USAGE_OPTIONS).default("when_useful"),
  length: lengthSettingsSchema,
  typeSpecific: typeSpecificSettingsSchema,
});

export type PresetSettings = z.infer<typeof presetSettingsSchema>;

/** Validates that a settings object's typeSpecific.documentType matches the preset's own document type. */
export function presetSettingsSchemaFor(documentType: DocumentType) {
  return presetSettingsSchema.refine((v) => v.typeSpecific.documentType === documentType, {
    message: "Settings do not match this preset's document type.",
    path: ["typeSpecific", "documentType"],
  });
}

export function defaultLengthForType(documentType: DocumentType): LengthSettings {
  switch (documentType) {
    case "linkedin_post":
      return { mode: "medium", unit: "characters" };
    case "article":
      return { mode: "medium", unit: "words" };
    case "newsletter":
      return { mode: "medium", unit: "words" };
    case "youtube_script":
      return { mode: "custom", unit: "minutes", min: 5, max: 10 };
    case "summary":
      return { mode: "medium", unit: "words" };
  }
}

export function defaultTypeSpecificSettings(documentType: DocumentType): TypeSpecificSettings {
  switch (documentType) {
    case "linkedin_post":
      return linkedinTypeSettingsSchema.parse({ documentType });
    case "article":
      return articleTypeSettingsSchema.parse({ documentType });
    case "youtube_script":
      return youtubeTypeSettingsSchema.parse({ documentType });
    case "newsletter":
      return newsletterTypeSettingsSchema.parse({ documentType });
    case "summary":
      return summaryTypeSettingsSchema.parse({ documentType });
  }
}

export function defaultPresetSettings(documentType: DocumentType): PresetSettings {
  return {
    voice: [],
    formality: "balanced",
    assertiveness: "balanced",
    firstPerson: "when_natural",
    paragraphStyle: "natural_variation",
    sentenceRhythm: "mixed",
    listUsage: "when_useful",
    length: defaultLengthForType(documentType),
    typeSpecific: defaultTypeSpecificSettings(documentType),
  };
}
