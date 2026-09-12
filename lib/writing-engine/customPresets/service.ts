import "server-only";
import type { DocumentType } from "@/types";
import {
  createCustomPreset,
  deleteCustomPreset,
  getCustomPreset,
  listCustomPresets,
  updateCustomPreset,
} from "@/lib/db/writingPresets";
import { ApiError } from "@/lib/utils/api";
import { getBuiltInPreset, getBuiltInPresets } from "../registry";
import { builtInPresetToResolved, customPresetToResolved } from "../snapshot";
import type { BuiltInPreset, CustomPresetRecord, ResolvedPreset } from "../types";

export async function listPresetsForType(
  documentType: DocumentType
): Promise<{ builtIn: BuiltInPreset[]; custom: CustomPresetRecord[] }> {
  const custom = await listCustomPresets(documentType);
  return { builtIn: getBuiltInPresets(documentType), custom };
}

/** Resolves any preset (built-in or custom) to a single shape, scoped to the given document type. */
export async function resolvePreset(
  documentType: DocumentType,
  presetId: string
): Promise<ResolvedPreset | null> {
  const builtIn = getBuiltInPreset(presetId);
  if (builtIn) {
    return builtIn.documentType === documentType ? builtInPresetToResolved(builtIn) : null;
  }

  const custom = await getCustomPreset(presetId);
  if (custom && custom.document_type === documentType) {
    return customPresetToResolved(custom);
  }

  return null;
}

function sanitizeRules(rules: string[]): string[] {
  return rules.map((r) => r.trim()).filter((r) => r.length > 0);
}

export async function createPreset(input: {
  documentType: DocumentType;
  name: string;
  description?: string | null;
  rules: string[];
  avoidRules: string[];
  settings?: CustomPresetRecord["settings"];
}): Promise<CustomPresetRecord> {
  return createCustomPreset({
    documentType: input.documentType,
    name: input.name,
    description: input.description ?? null,
    rules: sanitizeRules(input.rules),
    avoidRules: sanitizeRules(input.avoidRules),
    settings: input.settings ?? null,
  });
}

export async function updatePreset(
  presetId: string,
  input: {
    name?: string;
    description?: string | null;
    rules?: string[];
    avoidRules?: string[];
    settings?: CustomPresetRecord["settings"];
  }
): Promise<CustomPresetRecord> {
  const existing = await getCustomPreset(presetId);
  if (!existing) throw new ApiError(404, "Preset not found.");

  return updateCustomPreset(presetId, {
    ...input,
    rules: input.rules ? sanitizeRules(input.rules) : undefined,
    avoidRules: input.avoidRules ? sanitizeRules(input.avoidRules) : undefined,
  });
}

export async function deletePreset(presetId: string): Promise<void> {
  const existing = await getCustomPreset(presetId);
  if (!existing) throw new ApiError(404, "Preset not found.");
  await deleteCustomPreset(presetId);
}

/**
 * Duplicates a built-in or custom preset into a brand-new custom preset.
 * Built-in presets can never be edited or deleted, but CAN be duplicated —
 * this is the only way to turn one into something editable.
 */
export async function duplicatePreset(input: {
  presetId: string;
  documentType: DocumentType;
  name?: string;
}): Promise<CustomPresetRecord> {
  const resolved = await resolvePreset(input.documentType, input.presetId);
  if (!resolved) throw new ApiError(404, "Preset not found.");

  return createCustomPreset({
    documentType: input.documentType,
    name: input.name?.trim() || `${resolved.name} (Copy)`,
    description: resolved.description,
    rules: resolved.rules,
    avoidRules: resolved.avoidRules,
    settings: resolved.settings,
  });
}
