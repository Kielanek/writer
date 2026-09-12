import { defaultPresetSettings, type PresetSettings } from "@/lib/writing-engine/presetSettings";
import type { DocumentType } from "@/types";
import type { CustomPresetRecord, BuiltInPreset } from "@/lib/writing-engine/types";

export interface WizardState {
  name: string;
  description: string;
  settings: PresetSettings;
  rules: string[];
  avoidRules: string[];
}

export function emptyWizardState(documentType: DocumentType): WizardState {
  return {
    name: "",
    description: "",
    settings: defaultPresetSettings(documentType),
    rules: [],
    avoidRules: [],
  };
}

/** Prefills the wizard when editing an existing custom preset. */
export function wizardStateFromCustomPreset(preset: CustomPresetRecord, documentType: DocumentType): WizardState {
  return {
    name: preset.name,
    description: preset.description ?? "",
    settings: preset.settings ?? defaultPresetSettings(documentType),
    rules: preset.rules,
    avoidRules: preset.avoid_rules,
  };
}

/**
 * Prefills the wizard for "Duplicate & Customize" on a built-in preset.
 * Built-in presets have no structured settings, so per spec: copy their
 * rules/avoidRules as-is and leave the rest of the questionnaire at
 * sensible defaults rather than guessing a mapping.
 */
export function wizardStateFromBuiltInPreset(preset: BuiltInPreset): WizardState {
  return {
    name: `${preset.label} (Copy)`,
    description: preset.description,
    settings: defaultPresetSettings(preset.documentType),
    rules: preset.rules,
    avoidRules: preset.avoidRules,
  };
}

/** Prefills the wizard for "Duplicate & Customize" on a custom preset (carries settings over too). */
export function wizardStateFromDuplicatedCustomPreset(
  preset: CustomPresetRecord,
  documentType: DocumentType
): WizardState {
  return {
    name: `${preset.name} (Copy)`,
    description: preset.description ?? "",
    settings: preset.settings ?? defaultPresetSettings(documentType),
    rules: preset.rules,
    avoidRules: preset.avoid_rules,
  };
}
