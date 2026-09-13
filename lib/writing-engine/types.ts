import type { ProjectContext } from "@/lib/context/buildProjectContext";
import type { DocumentType } from "@/types";
import type { PresetSettings } from "./presetSettings";
import type { SeoKeywordConfig } from "./seoKeywords";

export type WritingRule = string;

export type PresetSource = "built_in" | "custom";

/** A developer-defined preset, discoverable only through the registry (never persisted). */
export interface BuiltInPreset {
  id: string;
  documentType: DocumentType;
  label: string;
  description: string;
  rules: WritingRule[];
  avoidRules: WritingRule[];
  version: number;
  /** Used as the fallback preset for older Documents with no snapshot, and pre-selected in the UI. */
  isDefault?: boolean;
}

/** A user-created preset, as stored in the `writing_presets` table. */
export interface CustomPresetRecord {
  id: string;
  user_id: string;
  document_type: DocumentType;
  name: string;
  description: string | null;
  rules: WritingRule[];
  avoid_rules: WritingRule[];
  /** Guided Preset Creator questionnaire answers. Null for presets created via the simple form, before this feature existed. */
  settings: PresetSettings | null;
  created_at: string;
  updated_at: string;
}

/**
 * A preset resolved to a single shape regardless of where it came from —
 * what the composer and the UI actually work with day to day.
 */
export interface ResolvedPreset {
  id: string;
  source: PresetSource;
  documentType: DocumentType;
  name: string;
  description: string | null;
  rules: WritingRule[];
  avoidRules: WritingRule[];
  version: number;
  /** Built-in presets can't be edited/deleted. */
  editable: boolean;
  settings: PresetSettings | null;
}

/**
 * A frozen copy of a preset's rules, stored on the Document at generation
 * time (documents.preset_snapshot). Never re-read from the live preset —
 * see lib/writing-engine/snapshot.ts for why. Includes `settings` so the
 * exact questionnaire configuration used to generate a Document survives
 * later edits to (or deletion of) the live preset.
 */
export interface PresetSnapshot {
  presetId: string;
  source: PresetSource;
  name: string;
  documentType: DocumentType;
  version: number;
  description?: string | null;
  rules: WritingRule[];
  avoidRules: WritingRule[];
  settings?: PresetSettings | null;
}

export interface ComposedPrompt {
  system: string;
  prompt: string;
}

export interface ComposeGenerationInput {
  documentType: DocumentType;
  presetSnapshot: PresetSnapshot;
  context: ProjectContext;
  instructions: string;
  /** Null except for Article, and for legacy Articles created before SEO keywords were mandatory. */
  seoKeywords: SeoKeywordConfig | null;
}

export interface ComposeEditInput {
  documentType: DocumentType;
  presetSnapshot: PresetSnapshot;
  context: ProjectContext;
  currentContent: string;
  creationInstructions: string;
  editInstruction: string;
  /** Null except for Article, and for legacy Articles created before SEO keywords were mandatory. */
  seoKeywords: SeoKeywordConfig | null;
}
