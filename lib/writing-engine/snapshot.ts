import type { DocumentType, Document } from "@/types";
import type { BuiltInPreset, CustomPresetRecord, PresetSnapshot, ResolvedPreset } from "./types";
import { getDefaultBuiltInPreset } from "./registry";

export function builtInPresetToResolved(preset: BuiltInPreset): ResolvedPreset {
  return {
    id: preset.id,
    source: "built_in",
    documentType: preset.documentType,
    name: preset.label,
    description: preset.description,
    rules: preset.rules,
    avoidRules: preset.avoidRules,
    version: preset.version,
    editable: false,
    // Built-in presets are never run through the questionnaire.
    settings: null,
  };
}

export function customPresetToResolved(preset: CustomPresetRecord): ResolvedPreset {
  return {
    id: preset.id,
    source: "custom",
    documentType: preset.document_type,
    name: preset.name,
    description: preset.description,
    rules: preset.rules,
    avoidRules: preset.avoid_rules,
    // Custom presets aren't versioned individually — a Document always
    // snapshots the preset's state *as it was* at generation time, so the
    // live preset's current version is irrelevant to already-generated Documents.
    version: 1,
    editable: true,
    settings: preset.settings,
  };
}

/** Freezes a resolved preset into the shape stored on documents.preset_snapshot. */
export function buildPresetSnapshot(preset: ResolvedPreset): PresetSnapshot {
  return {
    presetId: preset.id,
    source: preset.source,
    name: preset.name,
    documentType: preset.documentType,
    version: preset.version,
    description: preset.description,
    rules: preset.rules,
    avoidRules: preset.avoidRules,
    settings: preset.settings,
  };
}

function isValidSnapshot(value: unknown): value is PresetSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PresetSnapshot>;
  return (
    typeof v.presetId === "string" &&
    v.presetId.length > 0 &&
    Array.isArray(v.rules) &&
    Array.isArray(v.avoidRules)
  );
}

/**
 * Resolves the effective preset snapshot for an existing Document.
 * Migration safety: Documents created before the Writing Engine existed
 * have an empty/missing preset_snapshot — fall back to the default
 * built-in preset for their type rather than breaking.
 */
export function resolveDocumentPresetSnapshot(document: Pick<Document, "type" | "preset_snapshot">): PresetSnapshot {
  if (isValidSnapshot(document.preset_snapshot)) {
    return document.preset_snapshot;
  }
  return buildPresetSnapshot(builtInPresetToResolved(getDefaultBuiltInPreset(document.type as DocumentType)));
}
